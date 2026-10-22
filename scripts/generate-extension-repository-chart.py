#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib==3.10.8"]
# ///
"""Reproduce the post's chart: uv run scripts/generate-extension-repository-chart.py.

Add --fetch to refresh the GitHub snapshot. All merged PRs are included, grouped
by UTC merge month, for the twelve complete months October 2025–September 2026.
"""

import argparse
import calendar
import concurrent.futures
import csv
import datetime as dt
import json
from pathlib import Path
import subprocess

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import MultipleLocator
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research/duckdb-2-extension-repository-2026-10-22"
OUTPUT = ROOT / "public/media/posts/duckdb-2-query-farm-repository"
MONTHS = [(2025 + (9 + i) // 12, (9 + i) % 12 + 1) for i in range(12)]
FIELDS = "number,title,url,author,createdAt,mergedAt,isDraft"


def fetch_month(month):
    year, month = month
    start = f"{year}-{month:02d}-01"
    end = f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]}"
    result = subprocess.check_output([
        "gh", "pr", "list", "--repo", "duckdb/community-extensions",
        "--state", "merged", "--search", f"merged:{start}..{end}",
        "--limit", "1000", "--json", FIELDS,
    ], text=True)
    records = json.loads(result)
    assert len(records) < 1000, "Partition further to avoid GitHub's search cap"
    assert all(start <= r["mergedAt"][:10] <= end for r in records)
    (RESEARCH / f"{year}-{month:02d}.json").write_text(
        json.dumps(records, indent=2) + "\n"
    )
    return len(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    RESEARCH.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            count = sum(pool.map(fetch_month, MONTHS))
        (RESEARCH / "collection.json").write_text(json.dumps({
            "repository": "duckdb/community-extensions",
            "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "window": "2025-10-01 <= mergedAt < 2026-10-01 (UTC)",
            "selection": "All merged pull requests; no author/title filter. Includes CI, documentation and maintenance PRs.",
            "command": f"gh pr list --repo duckdb/community-extensions --state merged --search merged:START..END --limit 1000 --json {FIELDS}",
            "count": count,
        }, indent=2) + "\n")

    rows, summary = [], []
    for year, month in MONTHS:
        key = f"{year}-{month:02d}"
        records = json.loads((RESEARCH / f"{key}.json").read_text())
        values = []
        for record in records:
            assert record["mergedAt"].startswith(key)
            hours = (dt.datetime.fromisoformat(record["mergedAt"]) -
                     dt.datetime.fromisoformat(record["createdAt"])).total_seconds() / 3600
            assert hours >= 0
            values.append(hours)
            rows.append({
                "number": record["number"], "title": record["title"],
                "url": record["url"], "author": record["author"]["login"],
                "created_at": record["createdAt"], "merged_at": record["mergedAt"],
                "merge_month_utc": key, "hours_to_merge": round(hours, 6),
            })
        p25, median, p75, p90 = np.quantile(values, [.25, .5, .75, .9], method="linear")
        summary.append(dict(month=key, count=len(records), p25_hours=p25,
                            median_hours=median, p75_hours=p75, p90_hours=p90))
    assert len({r["number"] for r in rows}) == len(rows)
    assert len(rows) == json.loads((RESEARCH / "collection.json").read_text())["count"]
    for name, data in [("merged-prs.csv", sorted(rows, key=lambda r: r["number"])),
                       ("monthly-merge-times.csv", summary)]:
        with (OUTPUT / name).open("w", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=data[0].keys(), lineterminator="\n")
            writer.writeheader()
            writer.writerows(data)

    for font in (ROOT / "scripts/og-images/fonts").glob("NotoSans-*.ttf"):
        font_manager.fontManager.addfont(str(font))
    plt.rcParams.update({"font.family": "Noto Sans", "font.size": 11,
                         "svg.fonttype": "path", "svg.hashsalt": "qf-repo-2026",
                         "text.color": "#211a12", "axes.labelcolor": "#5d4632",
                         "xtick.color": "#5d4632", "ytick.color": "#5d4632"})
    x = np.arange(len(summary))
    med = np.array([r["median_hours"] for r in summary]) / 24
    lower = np.array([r["p25_hours"] for r in summary]) / 24
    upper = np.array([r["p75_hours"] for r in summary]) / 24
    p90 = np.array([r["p90_hours"] for r in summary]) / 24

    for mobile in [False, True]:
        fig, ax = plt.subplots(figsize=(4.8, 5.5) if mobile else (9.6, 5.6), dpi=100)
        fig.patch.set_facecolor("#f7f3ea")
        ax.set_facecolor("#f7f3ea")
        fig.subplots_adjust(left=.13 if mobile else .075, right=.96,
                            bottom=.23 if mobile else .25, top=.72 if mobile else .76)
        fig.text(.06 if mobile else .055, .94,
                 "How long community PRs take to merge" if mobile else
                 "Time to merge in the DuckDB community extension repository",
                 fontsize=12 if mobile else 17, weight="semibold")
        fig.text(.06 if mobile else .055, .89,
                 f"{len(rows):,} merged PRs · Oct 2025–Sep 2026", fontsize=11, color="#5d4632")
        band = ax.fill_between(x, lower, upper, color="#d9b875", alpha=.38,
                               label="Middle 50%", zorder=2)
        line, = ax.plot(x, med, color="#7d5714", linewidth=2.2, marker="o",
                        markersize=4.5, label="Median", zorder=4)
        tail, = ax.plot(x, p90, color="#446f22", linewidth=1.9, linestyle=(0, (4, 3)),
                        label="90th percentile", zorder=3)
        ax.set_ylim(0, 6)
        ax.set_xlim(-.15, 11.15)
        ax.yaxis.set_major_locator(MultipleLocator(1))
        ax.set_ylabel("Days from opening to merge", fontsize=10.5)
        ax.grid(axis="y", color="#ded5c3", linewidth=.8, zorder=0)
        ax.set_axisbelow(True)
        for side in ["top", "right", "left"]:
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color("#cfc4ad")
        ax.tick_params(axis="both", length=0, pad=9, labelsize=9.5)
        if mobile:
            ax.set_xticks([0, 3, 6, 9, 11], ["Oct ’25", "Jan ’26", "Apr", "Jul", "Sep"])
        else:
            ax.set_xticks(x, [dt.date(y, m, 1).strftime("%b") +
                              ("\n2025" if i == 0 else "\n2026" if i == 3 else "")
                              for i, (y, m) in enumerate(MONTHS)])
            for i, record in enumerate(summary):
                ax.text(i, -.20, f"n={record['count']}", transform=ax.get_xaxis_transform(),
                        ha="center", fontsize=8, color="#7a6e5d")
        fig.legend([line, band, tail], ["Median", "Middle 50%", "90th percentile"],
                   loc="upper left", bbox_to_anchor=(.06, .85), ncol=3,
                   frameon=False, fontsize=8.4 if mobile else 11,
                   handlelength=1.7, columnspacing=1.2)
        fig.text(.06 if mobile else .055, .075,
                 "Source: duckdb/community-extensions · GitHub API", fontsize=8.5, color="#5d4632")
        fig.text(.06 if mobile else .055, .04,
                 "Includes CI and author revisions; excludes publication time.", fontsize=8.1, color="#5d4632")
        name = "merge-times-mobile" if mobile else "merge-times"
        svg_path = OUTPUT / f"{name}.svg"
        fig.savefig(svg_path, metadata={"Date": None})
        svg_path.write_text("\n".join(line.rstrip() for line in svg_path.read_text().splitlines()) + "\n")
        fig.savefig(OUTPUT / f"{name}.png", dpi=180)
        plt.close(fig)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
