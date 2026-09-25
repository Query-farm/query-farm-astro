# /// script
# requires-python = ">=3.13"
# dependencies = ["haybarn==1.5.5rc1"]
# ///
"""Run with Haybarn's Python API; see README.md for setup and methodology."""

import argparse
import datetime
import hashlib
import json
import platform
import random
import shlex
import statistics
import subprocess
import time
from pathlib import Path

import haybarn


CASES = [
    dict(id="table_fast", kind="table", rows=32768, distinct=None,
         sql="SELECT sum(x) FROM bench.numbers(32768, 0)"),
    dict(id="table_wait_50ms", kind="table", rows=32768, distinct=None,
         sql="SELECT sum(x) FROM bench.numbers(32768, 50)"),
    dict(id="scalar_cheap_repeated", kind="scalar", rows=65536, distinct=128,
         sql="SELECT sum(bench.double_scalar(i % 128)) FROM src"),
    dict(id="scalar_cheap_unique", kind="scalar", rows=65536, distinct=65536,
         sql="SELECT sum(bench.double_scalar(i)) FROM src"),
    dict(id="scalar_cheap_new_values", kind="scalar", rows=65536, distinct=65536,
         sql="SELECT sum(bench.double_scalar(i + {offset})) FROM src", changing=True),
    dict(id="scalar_costly_repeated", kind="scalar", rows=32768, distinct=128,
         sql="SELECT sum(bench.costly_scalar(i % 128)) FROM src"),
    dict(id="stream_fast", kind="table_in_out_streaming", rows=65536, distinct=65536,
         sql="SELECT sum(i) FROM bench.echo((SELECT i FROM src), delay_ms := 0)"),
    dict(id="stream_wait_5ms", kind="table_in_out_streaming", rows=65536, distinct=65536,
         sql="SELECT sum(i) FROM bench.echo((SELECT i FROM src), delay_ms := 5)"),
    dict(id="lateral_costly_repeated", kind="table_in_out_lateral", rows=16384, distinct=128,
         sql="SELECT sum(y) FROM src, LATERAL bench.costly_rows(i % 128)"),
]


def stats(con):
    result = con.execute("SELECT * FROM vgi_result_cache_stats()")
    return dict(zip([d[0] for d in result.description], result.fetchone()))


def delta(before, after):
    return {k: after[k] - before[k] for k in before}


def run_case(case, args):
    # Fresh engine and catalog per case. No on-disk cache or external service.
    con = haybarn.connect()
    con.execute("LOAD vgi")
    con.execute("SET threads=1")
    con.execute("SET vgi_exchange_input_dedup=true")
    con.execute("SET vgi_result_cache_per_value=true")
    location = args.worker_command.replace("'", "''")
    con.execute(f"ATTACH 'cache_bench' AS bench (TYPE vgi, LOCATION '{location}')")
    con.execute(f"CREATE TABLE src AS SELECT i FROM range({case['rows']}) t(i)")
    settings = dict(con.execute("SELECT name, value FROM duckdb_settings() WHERE "
                               "name LIKE 'vgi%cache%' OR name IN ('threads', 'vgi_exchange_input_dedup')").fetchall())
    seq = 0
    expected = None

    def execute():
        nonlocal seq, expected
        seq += 1
        offset = seq * case["rows"] if case.get("changing") else 0
        query = case["sql"].format(offset=offset)
        start = time.perf_counter_ns()
        answer = con.execute(query).fetchall()
        elapsed = (time.perf_counter_ns() - start) / 1e6
        if case.get("changing"):
            n = case["rows"]
            assert answer == [(n * (n - 1) + 2 * n * offset,)], answer
        elif expected is None:
            expected = answer
        else:
            assert answer == expected, (case["id"], answer, expected)
        return {"ms": elapsed, "offset": offset, "answer": answer}

    # Prime the worker/process pool with caching off. Startup is excluded from
    # every arm, including "cold", which means an empty result cache only.
    con.execute("SET vgi_result_cache=false")
    for _ in range(2):
        execute()

    samples = {arm: [] for arm in ["disabled", "cold", "warm"]}
    counters = {arm: [] for arm in samples}
    # Shuffle arm order per trial to reduce systematic order/thermal bias.
    rng = random.Random(20260925)
    for trial in range(args.repeats):
        arms = list(samples)
        rng.shuffle(arms)
        for arm in arms:
            con.execute("SELECT * FROM vgi_result_cache_flush()").fetchall()
            con.execute(f"SET vgi_result_cache={'false' if arm == 'disabled' else 'true'}")
            if arm == "warm":
                # Default per-chunk store cap is 256; ten passes allow a
                # 2,048-distinct-value chunk to warm without tuning that cap.
                for _ in range(10):
                    execute()
            before = stats(con)
            sample = execute()
            samples[arm].append(sample)
            counters[arm].append(delta(before, stats(con)))
    con.close()
    return {**case, "settings": settings, "samples": samples, "counter_deltas": counters,
            "median_ms": {arm: statistics.median(s['ms'] for s in rows)
                          for arm, rows in samples.items()}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-command", default="uv run " + shlex.quote(str(Path(__file__).with_name('worker.py').resolve())))
    parser.add_argument("--output", type=Path, default=Path("results.json"))
    parser.add_argument("--repeats", type=int, default=7)
    parser.add_argument("--cases", help="Comma-separated case IDs; default: all")
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    con = haybarn.connect()
    con.execute("LOAD vgi")
    extension = con.execute("SELECT extension_version, installed_from FROM duckdb_extensions() WHERE extension_name='vgi'").fetchone()
    env = {"date_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "haybarn": haybarn.__version__, "engine": con.execute("SELECT version()").fetchone()[0],
           "vgi_extension": extension[0], "extension_source": extension[1],
           "os": platform.platform(), "python": platform.python_version(),
           "worker_launch": "Python subprocess over stdio", "repeats": args.repeats,
           "worker_environment": json.loads(subprocess.check_output(
               shlex.split(args.worker_command) + ["--benchmark-env"], text=True)),
           "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "worker_sha256": hashlib.sha256(Path(__file__).with_name('worker.py').read_bytes()).hexdigest()}
    if platform.system() == "Darwin":
        env["cpu"] = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
        env["memory_bytes"] = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True))
    con.close()
    result = {"environment": env, "cases": []}
    cases = CASES if not args.cases else [c for c in CASES if c['id'] in args.cases.split(',')]
    if not cases:
        parser.error("No matching cases")
    for case in cases:
        row = run_case(case, args)
        result["cases"].append(row)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(case["id"], json.dumps(row["median_ms"]), flush=True)


if __name__ == "__main__":
    main()
