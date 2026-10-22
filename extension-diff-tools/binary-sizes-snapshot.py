#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""Snapshot published extension builds by distribution, release, and platform.

The default refresh checks Query.Farm's builds for the latest DuckDB release
and the built-in community repository for the pinned Haybarn browser release. Builds use the
committed snapshots without network access. Only a confirmed HTTP 404 means
unavailable; failed requests abort the refresh before any snapshots are written.
"""
import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

REPOSITORIES = {
    "duckdb": "https://duckdb-extensions.query.farm",
    "haybarn": "https://haybarn-extensions.query.farm/community",
}
EXTENSION_NAMES = {"openprompt": "open_prompt"}
HEADERS = {"User-Agent": "query-farm-site-binary-sizes/2.0"}
ARTIFACT_TYPES = {
    "application/gzip", "application/x-gzip", "application/wasm",
    "application/octet-stream", "binary/octet-stream",
}
PLATFORMS = [
    ("linux_amd64", "Linux", "x86_64", "duckdb_extension.gz"),
    ("linux_arm64", "Linux", "aarch64", "duckdb_extension.gz"),
    ("linux_amd64_musl", "Linux (musl)", "x86_64", "duckdb_extension.gz"),
    ("linux_arm64_musl", "Linux (musl)", "aarch64", "duckdb_extension.gz"),
    ("osx_amd64", "macOS", "Intel", "duckdb_extension.gz"),
    ("osx_arm64", "macOS", "Apple Silicon", "duckdb_extension.gz"),
    ("windows_amd64", "Windows", "x86_64", "duckdb_extension.gz"),
    ("windows_arm64", "Windows", "ARM64", "duckdb_extension.gz"),
    ("windows_amd64_mingw", "Windows", "x86_64 (MinGW)", "duckdb_extension.gz"),
    ("wasm_eh", "WASM", "eh", "duckdb_extension.wasm"),
    ("wasm_mvp", "WASM", "mvp", "duckdb_extension.wasm"),
    ("wasm_threads", "WASM", "threads", "duckdb_extension.wasm"),
]


def version_number(value: str) -> str:
    number = value.removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", number):
        raise ValueError(f"Invalid release version: {value}")
    return number


def browser_version(site: Path) -> str:
    package = json.loads((site / "package.json").read_text())
    pin = package["dependencies"]["@haybarn/haybarn-wasm"]
    return version_number(pin.split("-", 1)[0])


def probe_size(client: httpx.Client, url: str) -> tuple[int | None, bool]:
    """Read artifact headers, falling back to a bounded signature read.

    A missing Content-Length is permitted; a server error or an HTML response
    is not evidence of an unavailable extension. Retry transient failures.
    """
    for attempt in range(3):
        try:
            response = client.head(url, follow_redirects=True)
            if response.status_code == 404:
                return None, False
            if response.status_code not in (200, 405):
                response.raise_for_status()
                raise ValueError(f"Unexpected HEAD response {response.status_code}: {url}")
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0] if response.status_code == 200 else ""
            if content_type and content_type not in ARTIFACT_TYPES:
                raise ValueError(f"Not an extension artifact ({content_type}): {url}")
            size = response.headers.get("Content-Length", "") if response.status_code == 200 else ""
            if response.status_code == 200 and content_type and size.isdigit() and int(size) >= 512:
                return int(size), True
            # Use streaming even when Range is ignored; never download the
            # whole extension just to determine whether it exists.
            with client.stream("GET", url, headers={"Range": "bytes=0-3"}, follow_redirects=True) as sample:
                if sample.status_code == 404:
                    return None, False
                if sample.status_code not in (200, 206):
                    sample.raise_for_status()
                    raise ValueError(f"Unexpected GET response {sample.status_code}: {url}")
                sample_type = sample.headers.get("Content-Type", "").split(";", 1)[0] or content_type
                if sample_type and sample_type not in ARTIFACT_TYPES:
                    raise ValueError(f"Not an extension artifact ({sample_type}): {url}")
                first = b""
                for chunk in sample.iter_raw():
                    first += chunk
                    if len(first) >= 4:
                        break
                magic = b"\x00asm" if url.endswith(".wasm") else b"\x1f\x8b"
                # Repositories may serve compressed WASM bytes without an
                # HTTP Content-Encoding header. Trust their artifact MIME
                # type; use magic only when the server omits Content-Type.
                if len(first) < 4 or (not sample_type and not first.startswith(magic)):
                    raise ValueError(f"Invalid extension file signature: {url}")
                total = sample.headers.get("Content-Range", "").rsplit("/", 1)[-1]
                if total.isdigit():
                    return int(total), True
                if sample.status_code == 200:
                    size = sample.headers.get("Content-Length", "") or size
                if size.isdigit() and int(size) >= 512:
                    return int(size), True
                return None, True
        except (httpx.HTTPError, ValueError):
            if attempt == 2:
                raise
    raise AssertionError("unreachable")


def release_plan(client: httpx.Client, site: Path, duckdb: str | None) -> list[tuple[str, str]]:
    if duckdb is None:
        response = client.get("https://api.github.com/repos/duckdb/duckdb/releases/latest")
        response.raise_for_status()
        duckdb = response.json()["tag_name"]
    # DuckDB 2 uses Query.Farm's custom repository. Haybarn 1.5 uses its
    # built-in community repository and does not need custom registration.
    return [
        ("duckdb", version_number(duckdb)),
        ("haybarn", browser_version(site)),
    ]


def snapshot_release(client: httpx.Client, distribution: str, version: str, slug: str) -> dict:
    repository = REPOSITORIES[distribution]
    platforms: list[dict] = []
    sizes: list[dict] = []
    by_display: dict[str, dict] = {}
    for platform, display, architecture, suffix in PLATFORMS:
        name = EXTENSION_NAMES.get(slug, slug)
        url = f"{repository}/v{version}/{platform}/{name}.{suffix}"
        size, exists = probe_size(client, url)
        if not exists:
            continue
        if display not in by_display:
            by_display[display] = {"platform": display, "architectures": []}
            platforms.append(by_display[display])
        by_display[display]["architectures"].append(architecture)
        if size is not None:
            sizes.append({"platform": display, "architecture": architecture, "bytes": size})
    return {"distribution": distribution, "version": version, "repository": repository,
            "platforms": platforms, "binarySizes": sizes}


def assemble_snapshot(releases: list[dict], browser: str, checked_at: str) -> dict:
    # These legacy fields describe the pinned browser distribution, never a
    # union of platforms from incompatible releases. Existing REPL consumers
    # therefore cannot mistake a native 2.0.0 build for a browser 1.5.6 build.
    runtime = next(r for r in releases if r["distribution"] == "haybarn" and r["version"] == browser)
    versions = sorted({r["version"] for r in releases if r["platforms"]},
                      key=lambda v: tuple(map(int, v.split("."))), reverse=True)
    return {"platforms": runtime["platforms"], "duckdbVersions": versions,
            "binarySizes": runtime["binarySizes"],
            "compatibilityCheckedAt": checked_at, "compatibilityReleases": releases}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, type=Path)
    parser.add_argument("--duckdb-version", help="Override the DuckDB release to check in Query.Farm's repository")
    parser.add_argument("--slug", help="Refresh just one extension")
    parser.add_argument("--soft", action="store_true", help="Keep committed snapshots on errors")
    args = parser.parse_args()
    extension_dir = args.site / "src/data/extensions"
    slugs = [args.slug] if args.slug else sorted(
        directory.name for directory in extension_dir.iterdir()
        if directory.is_dir() and directory.name != "example" and (directory / "augment/metadata.json").exists()
    )
    try:
        browser = browser_version(args.site)
        with httpx.Client(headers=HEADERS, timeout=20, limits=httpx.Limits(max_connections=20)) as client:
            plan = release_plan(client, args.site, args.duckdb_version)
            print(f"Checking {len(slugs)} extensions across {plan}; browser stays on {browser}.", flush=True)
            jobs = [(slug, distribution, version) for slug in slugs for distribution, version in plan]
            def work(job):
                slug, distribution, version = job
                return slug, snapshot_release(client, distribution, version, slug)
            with ThreadPoolExecutor(max_workers=16) as pool:
                results = list(pool.map(work, jobs))
        checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        grouped: dict[str, list[dict]] = {slug: [] for slug in slugs}
        for slug, release in results:
            grouped[slug].append(release)
        snapshots = {slug: assemble_snapshot(releases, browser, checked_at) for slug, releases in grouped.items()}
    except Exception as error:
        print(f"[binary-sizes] Refresh failed; all committed snapshots preserved: {error}", file=sys.stderr)
        sys.exit(0 if args.soft else 1)
    for slug, snapshot in snapshots.items():
        target = extension_dir / slug / "generated/compatibility.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(snapshot, indent=2) + "\n")
        counts = ", ".join(f'{r["distribution"]} {r["version"]}: {sum(len(p["architectures"]) for p in r["platforms"])} builds'
                           for r in snapshot["compatibilityReleases"])
        print(f"  {slug}: {counts}", flush=True)
    print(f"Wrote {len(snapshots)} compatibility snapshots.")


if __name__ == "__main__":
    main()
