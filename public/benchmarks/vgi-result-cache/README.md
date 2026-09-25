# VGI result-cache benchmark for Haybarn

These workloads accompany “Bringing HTTP’s caching rules to DuckDB functions with VGI.” Run them with
**Haybarn**, using its Python API. No stock DuckDB Python package is used.

Files: [runner](./run.py), [worker](./worker.py), [raw results](./results.json).
Save the runner and worker in the same directory.

## Reproduce

Install [uv](https://docs.astral.sh/uv/) and a VGI extension compatible with Haybarn:

```sh
uv run --with haybarn==1.5.5rc1 python -c "import haybarn; c = haybarn.connect(); c.execute('INSTALL vgi FROM community')"
uv run --script run.py --output my-results.json
```

The scripts pin Haybarn and the worker's main dependencies in their inline
metadata. The recorded run used Haybarn **1.5.5rc1**, VGI **8f9571b**, Python
**3.14.7**, vgi-python **0.37.1**, vgi-rpc **0.47.0**, and PyArrow **25.0.1**.
The VGI commit is
[8f9571b7d2a7ff26ba49373ba1242cbc31a7437a](https://github.com/Query-farm/vgi/commit/8f9571b7d2a7ff26ba49373ba1242cbc31a7437a).
Community installation can supply a newer extension; compare the extension
version recorded in your output before treating runs as the same configuration.
The runner loads the installed extension and does not upgrade it.

The host was an Apple M3 with 24 GiB RAM on macOS 15.6.1. All cases use one engine
thread, a Python subprocess over stdio, and memory caching only. This is a local
benchmark, not an HTTP/network benchmark. Hardware and software changes can
change the results substantially.

## Workloads

| Case | Work | Rows per query | Distinct input values |
|---|---|---:|---:|
| `table_fast` | Generate integers | 32,768 | Not applicable |
| `table_wait_50ms` | Same generation, plus one simulated 50 ms upstream wait | 32,768 | Not applicable |
| `scalar_cheap_repeated` | Integer × 2 | 65,536 | 128 |
| `scalar_cheap_unique` | Integer × 2 | 65,536 | 65,536, reused across queries |
| `scalar_cheap_new_values` | Integer × 2 | 65,536 | 65,536, disjoint on every query |
| `scalar_costly_repeated` | PBKDF2-HMAC-SHA256, 300 iterations per value | 32,768 | 128 |
| `stream_fast` | Streaming table-in/out passthrough | 65,536 | 65,536 |
| `stream_wait_5ms` | Same passthrough, plus a simulated 5 ms wait per input batch | 65,536 | 65,536 |
| `lateral_costly_repeated` | Correlated table-in/out PBKDF2 map | 16,384 | 128 |

The PBKDF2 workload performs real CPU work and returns a deterministic 63-bit
integer derived from the digest. It is an illustrative expensive function, not
a measurement of a geocoder or model. The two sleep-based cases explicitly
simulate service latency; their speedups depend on the chosen delay.

## Measurement

Each case uses a fresh Haybarn connection and catalog. It primes the worker with
two untimed queries with caching disabled. Therefore **cold means an empty
result cache, not process startup**, operating-system page-cache state, or a new
network connection.

Seven trials measure three arms, with reproducibly shuffled arm order:

- **Disabled:** master result-cache switch off. Input deduplication stays on.
- **Cold:** cache enabled and flushed immediately before the measured query.
- **Warm/later:** cache flushed, ten untimed queries, then the measured query.
  Input values change on every query in `scalar_cheap_new_values`, so this arm
  measures a populated cache with zero reuse, not warm hits.

Ten priming queries allow the default per-chunk per-value store cap of 256 to
populate all 2,048 distinct values in a chunk without changing that setting.
All other cache budgets and store limits remain at their recorded defaults.
There is no TTL expiry, disk caching, revalidation, or multithreaded execution.
Buffered functions and per-partition caching are not benchmarked here.

Timing uses `perf_counter_ns()` around `execute(...).fetchall()`: complete SQL
execution including binding, input scanning, cache work, RPC, aggregation, and
fetching the single aggregate result. ATTACH, worker startup, cache flushes,
priming, and counter queries are outside the timed interval. Every result is
checked against the uncached result; the changing-input arithmetic case is
checked against its analytic sum. This validates the aggregate answers, not
every possible property of a cache implementation.

`results.json` retains every timing, answer, input offset, per-query cache-counter
delta, settings snapshot, package version, and script checksum. Article timings
are medians, rounded to one decimal place. Avoid reading small differences near
parity as a reliable win. For example, fresh-input scalar later-query timings
ranged from 23.4 to 88.2 ms in this run; the median was 24.2 ms.

The checked counters show:

- Every disabled sample had zero cache hits.
- Every warm sample on stable inputs had hits and zero exchange misses.
- Every changing-input sample had zero hits.
- A cold scalar query with repeated values can already hit values stored by an
  earlier batch in the same query. Its cache is empty only at query start.

Use `--cases scalar_cheap_unique,stream_fast` to run selected cases or
`--repeats 15` for more samples. `--worker-command` accepts another launch command;
that worker must support the included `--benchmark-env` metadata option.
