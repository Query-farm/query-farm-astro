#!/usr/bin/env python3
"""Reproduce the November 2026 extension availability comparison.

python3 scripts/measure-extension-availability.py          # summarize saved data
python3 scripts/measure-extension-availability.py --fetch  # probe the pinned cohort again

HEAD requests check availability; a four-byte range verifies artifacts whose
server omits Content-Type. HTTP 200 is not an INSTALL/LOAD test. A 404 is missing;
other errors remain unknown after retries.
The separately reviewed migration-stub sources are recorded in cohort.json.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/media/posts/duckdb-2-extension-availability"
VERSIONS = ["1.5.5", "1.5.6", "2.0.0"]
BASELINE = "1.5.5"
TARGET = "2.0.0"
PLATFORMS = ["linux_amd64", "linux_arm64", "osx_arm64", "windows_amd64", "wasm_eh"]
REPOSITORIES = {"community": "https://community-extensions.duckdb.org",
                "query_farm": "https://duckdb-extensions.query.farm"}
FIELDS = ["repository", "extension", "version", "platform", "status",
          "bytes", "last_modified", "checked_at", "error"]


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def artifact_url(repository, extension, version, platform):
    suffix = "wasm" if platform.startswith("wasm_") else "gz"
    return f"{REPOSITORIES[repository]}/v{version}/{platform}/{extension}.duckdb_extension.{suffix}"


def probe(job):
    repository, extension, version, platform = job
    row = dict(zip(FIELDS[:4], job))
    row.update(status="unknown", bytes="", last_modified="", checked_at="", error="")
    request = urllib.request.Request(artifact_url(*job), method="HEAD", headers={
        "User-Agent": "query-farm-extension-availability-research",
        "Accept-Encoding": "identity",
    })
    for attempt in range(3):
        if attempt:
            time.sleep(2 ** attempt)
        row["checked_at"] = now()
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status}")
                content_type = response.headers.get("Content-Type", "").split(";")[0]
                if content_type and content_type not in ("application/gzip", "application/x-gzip",
                                        "application/octet-stream", "application/wasm"):
                    raise ValueError(f"Unexpected content type: {content_type}")
                length = response.headers.get("Content-Length", "")
                if length and int(length) < 512:
                    raise ValueError(f"Unexpected artifact size: {length}")
                if not content_type:
                    sample = urllib.request.Request(artifact_url(*job), headers={
                        "User-Agent": "query-farm-extension-availability-research",
                        "Range": "bytes=0-3", "Accept-Encoding": "identity",
                    })
                    with urllib.request.urlopen(sample, timeout=20) as body:
                        magic = body.read(4)
                    expected = b"\x00asm" if platform.startswith("wasm_") else b"\x1f\x8b"
                    if not magic.startswith(expected):
                        raise ValueError("Unexpected artifact file signature")
                row.update(status="200", bytes=length,
                           last_modified=response.headers.get("Last-Modified", ""), error="")
                return row
        except urllib.error.HTTPError as error:
            if error.code == 404:
                row.update(status="404", error="")
                return row
            row["error"] = f"HTTP {error.code}"
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            row["error"] = str(error)
    return row


def jobs(cohort):
    for name in cohort["names"]:
        for version in VERSIONS:
            for platform in PLATFORMS:
                yield ("community", name, version, platform)
    # Include all Query Farm-owned descriptors, including those without stubs.
    for name in cohort["queryFarmNames"]:
        for platform in PLATFORMS:
            yield ("query_farm", name, "2.0.0", platform)


def collect(cohort):
    started = now()
    expected = list(jobs(cohort))
    rows = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        for index, row in enumerate(pool.map(probe, expected), 1):
            rows.append(row)
            if index % 1000 == 0:
                print(f"Checked {index}/{len(expected)}", flush=True)
    with (OUTPUT / "availability.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    metadata = {"engine": "upstream DuckDB", "startedAt": started, "completedAt": now(), "versions": VERSIONS,
                "platforms": PLATFORMS, "repositories": REPOSITORIES,
                "observations": len(rows), "unknown": sum(r["status"] == "unknown" for r in rows),
                "method": "HEAD; 200 with artifact content type (or file signature via a four-byte range when Content-Type is absent) and plausible size when supplied = present; 404 = absent; all other outcomes = unknown after three attempts. No binaries executed."}
    (OUTPUT / "collection.json").write_text(json.dumps(metadata, indent=2) + "\n")


def summarize(cohort):
    with (OUTPUT / "availability.csv").open() as file:
        rows = list(csv.DictReader(file))
    keys = [tuple(row[k] for k in FIELDS[:4]) for row in rows]
    assert len(set(keys)) == len(keys), "Duplicate observations"
    assert set(keys) == set(jobs(cohort)), "Incomplete or unexpected cohort"
    metadata = json.loads((OUTPUT / "collection.json").read_text())
    assert metadata["observations"] == len(rows), "Collection metadata disagrees with observations"
    assert all(row["status"] in ("200", "404", "unknown") for row in rows)
    unknown = [row for row in rows if row["status"] == "unknown"]
    if unknown:
        raise ValueError(f"{len(unknown)} unresolved probes; do not interpret unknowns as missing")
    stubs = set(cohort["migrationStubs"])
    available = {(r["repository"], r["version"], r["platform"], r["extension"])
                 for r in rows if r["status"] == "200"}

    def names(repository, version, platforms):
        return {name for repo, ver, platform, name in available
                if repo == repository and ver == version and platform in platforms}

    summary = []
    comparisons = []
    for platform in [*PLATFORMS, "any_tested_platform"]:
        platforms = PLATFORMS if platform == "any_tested_platform" else [platform]
        for version in VERSIONS:
            community = names("community", version, platforms)
            migrated = names("query_farm", version, platforms)
            adjusted = (community - stubs) | migrated if version == "2.0.0" else community
            summary.append({"platform": platform, "version": version,
                            "community_artifacts": len(community),
                            "known_stub_artifacts": len(community & stubs) if version == "2.0.0" else 0,
                            "migrated_destination_artifacts": len(migrated),
                            "excluding_stubs_including_destinations": len(adjusted)})
        old = names("community", BASELINE, platforms)
        new = ((names("community", TARGET, platforms) - stubs)
               | names("query_farm", TARGET, platforms))
        comparisons.append({"platform": platform, "baseline_version": BASELINE,
                            "target_version": TARGET, "baseline": len(old),
                            "retained": len(old & new), "missing": sorted(old - new),
                            "added": sorted(new - old),
                            "retention_percent": round(len(old & new) / len(old) * 100, 1) if old else None})
    with (OUTPUT / "summary.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(summary[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(summary)
    (OUTPUT / "comparison.json").write_text(json.dumps(comparisons, indent=2) + "\n")
    baseline = names("community", BASELINE, PLATFORMS)
    later_patch = names("community", "1.5.6", PLATFORMS)
    target = (names("community", TARGET, PLATFORMS) - stubs) | names("query_farm", TARGET, PLATFORMS)
    changes = {
        "baseline_version": BASELINE, "target_version": TARGET,
        "reference_versions": ["1.5.5", "1.5.6"],
        "scope": "A name is present if it has an artifact on any of the five selected platforms. Known migration stubs are excluded; Query Farm destination builds are included.",
        "missing_from_target": sorted(baseline - target),
        "added_since_baseline": sorted(target - baseline),
        "only_in_target": sorted(target - (baseline | later_patch)),
        "added_since_baseline_already_in_1_5_6": sorted((target - baseline) & later_patch),
        "baseline_missing_from_1_5_6": sorted(baseline - later_patch),
    }
    (OUTPUT / "extension-changes.json").write_text(json.dumps(changes, indent=2) + "\n")
    with (OUTPUT / "extension-matrix.csv").open("w", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(["extension", "platform", *VERSIONS])
        for name in cohort["names"]:
            for platform in PLATFORMS:
                cells = []
                for version in VERSIONS:
                    if version == "2.0.0" and ("query_farm", version, platform, name) in available:
                        cells.append("query_farm")
                    elif ("community", version, platform, name) in available and not (version == "2.0.0" and name in stubs):
                        cells.append("community")
                    else:
                        cells.append("missing")
                writer.writerow([name, platform, *cells])
    print(json.dumps({"summary": summary, "comparisons": comparisons}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    cohort = json.loads((OUTPUT / "cohort.json").read_text())
    if args.fetch:
        collect(cohort)
    summarize(cohort)
