#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx>=0.27",
# ]
# ///
"""
Binary-size snapshot.

Pulls per-(platform, architecture) compiled extension sizes for every Query.Farm
extension from the Haybarn extension repository — a single central source that
rebuilds and hosts both core and community DuckDB extensions — and writes them
into each extension's generated/compatibility.json, alongside the platform
matrix (derived from which binaries actually exist) and the Haybarn version
probed.

The committed JSON is the fallback. --soft warns and exits 0 on any failure so a
build proceeds offline or in CI without reaching the network.

Usage:
  binary-sizes-snapshot.py --site <site-repo> [--haybarn-version vX.Y.Z] [--soft]
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

REPO = "http://haybarn-extensions.query.farm/community"
# The CDN 403s the default python-urllib/httpx user agent; identify ourselves.
HEADERS = {"User-Agent": "query-farm-site-binary-sizes/1.0"}

# (haybarn platform key) -> (display platform, architecture, artifact suffix).
# Order here defines the order platforms/architectures appear in the docs.
PLATFORMS = [
    ("linux_amd64",      "Linux",        "x86_64",        "duckdb_extension.gz"),
    ("linux_arm64",      "Linux",        "aarch64",       "duckdb_extension.gz"),
    ("linux_amd64_musl", "Linux (musl)", "x86_64",        "duckdb_extension.gz"),
    ("osx_amd64",        "macOS",        "Intel",         "duckdb_extension.gz"),
    ("osx_arm64",        "macOS",        "Apple Silicon", "duckdb_extension.gz"),
    ("windows_amd64",    "Windows",      "x86_64",        "duckdb_extension.gz"),
    ("wasm_eh",          "WASM",         "",              "duckdb_extension.wasm"),
]

# Not real installable extensions — never probed.
SKIP_SLUGS = {"example"}


def probe_size(client: httpx.Client, url: str) -> tuple[int | None, bool]:
    """Return (size_bytes, exists). `exists` is True when a binary is served at
    `url`; `size_bytes` may still be None if the size can't be determined.

    Tries HEAD first (works for the gzipped artifacts). Cloudflare serves some
    artifacts (notably .wasm) without a Content-Length on HEAD, so fall back to
    a single-byte ranged GET and read the total from Content-Range."""
    try:
        r = client.head(url, follow_redirects=True)
        if r.status_code == 404:
            return None, False
        if r.status_code == 200:
            cl = r.headers.get("Content-Length")
            if cl and cl.isdigit():
                return int(cl), True
    except httpx.HTTPError:
        pass

    try:
        r = client.get(url, headers={"Range": "bytes=0-0"}, follow_redirects=True)
        if r.status_code == 404:
            return None, False
        if r.status_code in (200, 206):
            cr = r.headers.get("Content-Range")  # e.g. "bytes 0-0/13146769"
            if cr and "/" in cr:
                total = cr.rsplit("/", 1)[-1]
                if total.isdigit():
                    return int(total), True
            cl = r.headers.get("Content-Length")
            if r.status_code == 200 and cl and cl.isdigit():
                return int(cl), True
            return None, True  # present, size unknown
    except httpx.HTTPError:
        pass
    return None, False


def snapshot_extension(client: httpx.Client, version: str, slug: str) -> dict | None:
    """Probe every platform for one extension. Returns a compatibility dict
    ({platforms, duckdbVersions, binarySizes}) or None if nothing was found."""
    platforms: list[dict] = []
    binary_sizes: list[dict] = []
    by_display: dict[str, dict] = {}

    for plat_key, display, arch, suffix in PLATFORMS:
        url = f"{REPO}/{version}/{plat_key}/{slug}.{suffix}"
        size, exists = probe_size(client, url)
        if not exists:
            continue
        entry = by_display.get(display)
        if entry is None:
            entry = {"platform": display, "architectures": []}
            by_display[display] = entry
            platforms.append(entry)
        if arch and arch not in entry["architectures"]:
            entry["architectures"].append(arch)
        if size is not None:
            binary_sizes.append({"platform": display, "architecture": arch, "bytes": size})

    if not platforms:
        return None
    return {
        "platforms": platforms,
        "duckdbVersions": [version.lstrip("v")],
        "binarySizes": binary_sizes,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, type=Path, help="Path to query-farm-astro repo")
    ap.add_argument("--haybarn-version", default=None,
                    help="Haybarn version tag to probe (default: site's latest, e.g. v1.5.3)")
    ap.add_argument("--slug", default=None, help="Only refresh this extension")
    ap.add_argument("--soft", action="store_true", help="Warn and exit 0 on any failure")
    args = ap.parse_args()

    version = args.haybarn_version
    if not version:
        vfile = args.site / "src/data/haybarn-versions.generated.json"
        try:
            version = json.loads(vfile.read_text())["latestVersion"]
        except Exception as e:
            msg = f"Could not read Haybarn version from {vfile}: {e}"
            if args.soft:
                print(f"[binary-sizes] skipped — {msg}", file=sys.stderr)
                sys.exit(0)
            print(f"Error: {msg}", file=sys.stderr)
            sys.exit(1)

    ext_dir = args.site / "src/data/extensions"
    slugs = ([args.slug] if args.slug
             else sorted(d.name for d in ext_dir.iterdir()
                         if d.is_dir() and (d / "augment/metadata.json").exists()
                         and d.name not in SKIP_SLUGS))

    print(f"Probing Haybarn {version} for binary sizes ({len(slugs)} extensions)...")
    written = 0
    try:
        with httpx.Client(headers=HEADERS, timeout=20, http2=False,
                          limits=httpx.Limits(max_connections=16)) as client:
            def work(slug: str):
                return slug, snapshot_extension(client, version, slug)

            with ThreadPoolExecutor(max_workers=12) as pool:
                results = list(pool.map(work, slugs))
    except Exception as e:
        if args.soft:
            print(f"[binary-sizes] skipped — probe failed ({e}); keeping committed sizes", file=sys.stderr)
            sys.exit(0)
        print(f"Error probing Haybarn repository: {e}", file=sys.stderr)
        sys.exit(1)

    for slug, compat in results:
        if not compat:
            print(f"  {slug}: no binaries found (left as-is)")
            continue
        target = ext_dir / slug / "generated" / "compatibility.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(compat, indent=2) + "\n")
        n_plat = len(compat["platforms"])
        n_size = len(compat["binarySizes"])
        print(f"  {slug}: {n_plat} platforms, {n_size} sizes")
        written += 1

    print(f"\nWrote {written} compatibility.json files.")
    if written == 0 and not args.soft:
        print("Error: no extensions resolved any binaries — is the repository reachable?",
              file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
