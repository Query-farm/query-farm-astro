#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib==3.10.8"]
# ///
"""Render the saved comparison: uv run scripts/generate-extension-availability-chart.py."""

import csv
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Circle
from matplotlib.ticker import MultipleLocator

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/media/posts/duckdb-2-extension-availability"
LABELS = {"linux_amd64": "Linux x64", "linux_arm64": "Linux ARM64",
          "osx_arm64": "macOS Apple Silicon", "windows_amd64": "Windows x64",
          "wasm_eh": "WebAssembly (EH)"}
with (OUTPUT / "summary.csv").open() as file:
    counts = {(row["platform"], row["version"]): int(row["excluding_stubs_including_destinations"])
              for row in csv.DictReader(file)}
for font in (ROOT / "scripts/og-images/fonts").glob("NotoSans-*.ttf"):
    font_manager.fontManager.addfont(str(font))
plt.rcParams.update({"font.family": "Noto Sans", "font.size": 11,
                     "svg.fonttype": "path", "svg.hashsalt": "qf-availability-2026",
                     "text.color": "#211a12", "axes.labelcolor": "#5d4632",
                     "xtick.color": "#5d4632", "ytick.color": "#211a12"})

for mobile in [False, True]:
    fig, ax = plt.subplots(figsize=(4.8, 7) if mobile else (9.6, 6), dpi=100)
    fig.patch.set_facecolor("#f7f3ea")
    ax.set_facecolor("#f7f3ea")
    fig.subplots_adjust(left=.36 if mobile else .25, right=.91, top=.76, bottom=.22)
    fig.text(.055, .94, "DuckDB extension availability by platform",
             fontsize=13 if mobile else 18, weight="semibold")
    fig.text(.055, .89, "Published artifacts · 5 November 2026", fontsize=10 if mobile else 12,
             color="#5d4632")
    for index, (platform, label) in enumerate(LABELS.items()):
        for version, offset, color in [("1.5.5", -.18, "#9a8c76"), ("2.0.0", .18, "#446f22")]:
            count = counts[platform, version]
            ax.barh(index + offset, count, height=.30, color=color,
                    label=version if index == 0 else None, zorder=3)
            ax.text(count + 5, index + offset, str(count), va="center",
                    fontsize=11)
    labels = [label.replace("macOS Apple Silicon", "macOS Apple\nSilicon") if mobile else label
              for label in LABELS.values()]
    ax.set_yticks(range(len(LABELS)), labels, fontsize=11)
    ax.invert_yaxis()
    ax.set_xlim(0, max(counts.values()) + 42)
    ax.xaxis.set_major_locator(MultipleLocator(100))
    ax.set_xlabel("Extension names with a published artifact", fontsize=9 if mobile else 10, labelpad=10)
    ax.grid(axis="x", color="#ded5c3", linewidth=.8, zorder=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(axis="both", length=0, pad=8)
    fig.legend(loc="upper left", bbox_to_anchor=(.04, .85), ncol=2, frameon=False,
               fontsize=12)
    footnotes = ["2.0.0 excludes 25 known migration stubs; their",
                 "Query Farm destination builds count where present.",
                 "Artifact availability does not establish runtime compatibility."] if mobile else [
                 "2.0.0 excludes 25 known migration stubs and counts their Query Farm destination builds where present.",
                 "Artifact availability does not establish runtime compatibility. Source: repository probes."]
    for index, line in enumerate(footnotes):
        fig.text(.055, .10 - index * .025, line, fontsize=9, color="#5d4632")
    name = "availability-mobile" if mobile else "availability"
    svg = OUTPUT / f"{name}.svg"
    fig.savefig(svg, metadata={"Date": None})
    svg.write_text("\n".join(line.rstrip() for line in svg.read_text().splitlines()) + "\n")
    fig.savefig(OUTPUT / f"{name}.png", dpi=160)
    plt.close(fig)

# Draw the two-set overlap to scale. Solve the circle separation from the
# measured intersection rather than choosing a visually convenient overlap.
comparison = next(row for row in json.loads((OUTPUT / "comparison.json").read_text())
                  if row["platform"] == "any_tested_platform")
baseline_version = comparison["baseline_version"]
target_version = comparison["target_version"]
baseline_total = comparison["baseline"]
target_total = counts["any_tested_platform", target_version]
shared = comparison["retained"]
baseline_only = len(comparison["missing"])
target_only = len(comparison["added"])
assert baseline_total == shared + baseline_only
assert target_total == shared + target_only
r1, r2 = math.sqrt(baseline_total / math.pi), math.sqrt(target_total / math.pi)


def intersection_area(distance):
    if distance <= abs(r1 - r2):
        return math.pi * min(r1, r2) ** 2
    if distance >= r1 + r2:
        return 0
    angle1 = math.acos((distance ** 2 + r1 ** 2 - r2 ** 2) / (2 * distance * r1))
    angle2 = math.acos((distance ** 2 + r2 ** 2 - r1 ** 2) / (2 * distance * r2))
    triangle = math.sqrt((-distance + r1 + r2) * (distance + r1 - r2)
                         * (distance - r1 + r2) * (distance + r1 + r2)) / 2
    return r1 ** 2 * angle1 + r2 ** 2 * angle2 - triangle


low, high = abs(r1 - r2), r1 + r2
for _ in range(80):
    middle = (low + high) / 2
    if intersection_area(middle) > shared:
        low = middle
    else:
        high = middle
distance = (low + high) / 2
assert math.isclose(intersection_area(distance), shared, abs_tol=1e-8)
c1, c2 = -distance / 2, distance / 2
left, right = c1 - r1, c2 + r2
region_centers = [(left + c2 - r2) / 2,
                  (c2 - r2 + c1 + r1) / 2,
                  (c1 + r1 + right) / 2]

for mobile in [False, True]:
    # Export a tightly framed diagram. The article supplies the context and
    # caption, so baked-in headings and notes should not shrink the circles.
    fig, ax = plt.subplots(figsize=(4.8, 4) if mobile else (6.4, 5.34), dpi=100)
    fig.patch.set_facecolor("#f7f3ea")
    fig.subplots_adjust(left=.02, right=.98, top=.98, bottom=.02)
    ax.set_aspect("equal")
    ax.set_xlim(left - .25, right + .25)
    ax.set_ylim(-max(r1, r2) - .25, max(r1, r2) + .25)
    ax.axis("off")

    baseline_circle = Circle((c1, 0), r1, facecolor="#ecd09a", linewidth=0)
    target_circle = Circle((c2, 0), r2, facecolor="#d6dfc3", linewidth=0)
    shared_region = Circle((c1, 0), r1, facecolor="#c8c3a2", linewidth=0)
    ax.add_patch(baseline_circle)
    ax.add_patch(target_circle)
    ax.add_patch(shared_region)
    shared_region.set_clip_path(target_circle)
    for center, radius, color in [(c1, r1, "#7d5714"), (c2, r2, "#446f22")]:
        ax.add_patch(Circle((center, 0), radius, facecolor="none", edgecolor=color, linewidth=1.5))

    labels = [f"{baseline_version}\nonly", "Both\nversions", f"{target_version}\nonly"]
    for x, value, label in zip(region_centers, [baseline_only, shared, target_only], labels):
        ax.text(x, .55, str(value), ha="center", va="center",
                fontsize=30 if mobile else 34, weight="semibold")
        ax.text(x, -1.65, label, ha="center", va="center",
                fontsize=11 if mobile else 13, linespacing=1.25)

    name = "overlap-mobile" if mobile else "overlap"
    svg = OUTPUT / f"{name}.svg"
    fig.savefig(svg, metadata={"Date": None})
    svg.write_text("\n".join(line.rstrip() for line in svg.read_text().splitlines()) + "\n")
    fig.savefig(OUTPUT / f"{name}.png", dpi=160)
    plt.close(fig)
