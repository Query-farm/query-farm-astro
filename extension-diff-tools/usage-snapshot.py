#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""
Usage snapshot tool

Query the Cloudflare Analytics Engine `query_farm_extension_loads` dataset for
per-extension load counts over a configurable window, then write
`generated/usage.json` files into each extension folder under the site repo.

The site's `mergeExtensionTree` folds these into `metadata.usageStats` so the
extension page renders "X loads in last Y days" as social proof. Hand-authored
`augment/metadata.json.usageStats` always wins — this only fills the gap.

Auth: reads CF_API_TOKEN and CF_ACCOUNT_ID from environment. The repo's .env
file sets both; source it before running:

    set -a && . .env && set +a
    extension-diff-tools/usage-snapshot.py --site . --days 30
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ENDPOINT = "https://api.cloudflare.com/client/v4/accounts/{acct}/analytics_engine/sql"

# Some extensions are loaded in DuckDB under a name that doesn't match their
# folder slug in this repo (the folder name is what users see in the URL; the
# load name is what `INSTALL`/AE reports). Map AE-side load names back to slugs.
LOAD_NAME_TO_SLUG = {
    "adbc": "adbc_scanner",
    "open_prompt": "openprompt",
}


def query(token: str, account_id: str, sql: str) -> dict:
    url = ENDPOINT.format(acct=account_id)
    r = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"},
        content=sql,
        timeout=30.0,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("success", True) and "errors" in body:
        raise RuntimeError(f"Analytics Engine error: {body['errors']}")
    return body


def fetch_loads(token: str, account_id: str, days: int) -> dict[str, int]:
    sql = (
        "SELECT index1 AS slug, SUM(_sample_interval) AS loads "
        "FROM query_farm_extension_loads "
        f"WHERE timestamp > NOW() - INTERVAL '{days}' DAY "
        "GROUP BY index1 "
        "FORMAT JSON"
    )
    body = query(token, account_id, sql)
    out: dict[str, int] = {}
    for row in body.get("data", []):
        slug = row.get("slug")
        if not slug:
            continue
        slug = LOAD_NAME_TO_SLUG.get(slug, slug)
        try:
            out[slug] = int(row.get("loads", 0))
        except (TypeError, ValueError):
            pass
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, type=Path,
                    help="Path to query-farm-astro repo")
    ap.add_argument("--days", type=int, default=30,
                    help="Window size in days (default 30)")
    ap.add_argument("--slug", default=None,
                    help="Only update this extension; otherwise update every "
                         "folder under src/data/extensions/")
    args = ap.parse_args()

    token = os.environ.get("CF_API_TOKEN")
    account_id = os.environ.get("CF_ACCOUNT_ID")
    if not token or not account_id:
        print("Error: CF_API_TOKEN and CF_ACCOUNT_ID must be set "
              "(source the repo's .env first).", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching last {args.days}-day load counts...")
    counts = fetch_loads(token, account_id, args.days)
    print(f"  got data for {len(counts)} extensions")

    extensions_dir = args.site / "src/data/extensions"
    if args.slug:
        slugs = [args.slug]
    else:
        slugs = sorted(d.name for d in extensions_dir.iterdir() if d.is_dir())

    period = f"last {args.days} days"
    as_of = datetime.now(timezone.utc).date().isoformat()

    written = 0
    for slug in slugs:
        n = counts.get(slug)
        if n is None:
            continue  # no usage data — leave any existing usage.json alone
        target = extensions_dir / slug / "generated" / "usage.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({
            "count": n,
            "period": period,
            "asOf": as_of,
        }, indent=2) + "\n")
        print(f"  {slug}: {n:,} loads")
        written += 1

    print(f"\nWrote {written} usage.json files.")


if __name__ == "__main__":
    main()
