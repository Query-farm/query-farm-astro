#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib==3.10.8"]
# ///
"""Reproduce the DuckDB 2.0 regressions post: uv run scripts/generate-duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2-charts.py

Reads the snapshot in research/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2-2026-11-24/ (see collection.json for how
it was gathered) and writes the figures, CSVs and the numbers quoted in the post.

"Regression issue" means an issue in duckdb/duckdb whose title or body mentions "regression",
excluding bots. Eras are assigned by the release that was current when the issue was filed.
"""

import collections
import csv
import datetime as dt
import json
from pathlib import Path
import statistics

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import MultipleLocator, PercentFormatter

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2-2026-11-24"
OUTPUT = ROOT / "public/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2"

UTC = dt.timezone.utc
RELEASES = {
    "1.4.0": dt.datetime(2025, 9, 16, 10, 17, 31, tzinfo=UTC),
    "1.5.0": dt.datetime(2026, 3, 9, 12, 40, 59, tzinfo=UTC),
    "2.0.0": dt.datetime(2026, 10, 21, 12, 49, 12, tzinfo=UTC),
    "2.0.1": dt.datetime(2026, 11, 20, 13, 34, 16, tzinfo=UTC),
}
SNAPSHOT_END = dt.datetime(2026, 11, 24, tzinfo=UTC)  # data through Nov 23 UTC
LAST_DAY = (SNAPSHOT_END - dt.timedelta(days=1)).strftime("%b %-d")

INK, INK_2, RULE, GRID, BG = "#211a12", "#5d4632", "#cfc4ad", "#ded5c3", "#f7f3ea"
SUN_700, SUN_500, MUTED, FIELD = "#7d5714", "#c08e2f", "#d9c9a4", "#446f22"


def ts(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def load():
    issues = json.loads((RESEARCH / "regression-issues.json").read_text())
    reporters = json.loads((RESEARCH / "reporters.json").read_text())
    rows = []
    for issue in issues:
        author = issue.get("author")
        if not author or author["__typename"] == "Bot":
            continue
        login = author["login"]
        first = ts(reporters[login]["first"])
        created = ts(issue["createdAt"])
        labels = {label["name"] for label in issue["labels"]["nodes"]}
        merged_fix = any(
            (node.get("source") or node.get("subject") or {}).get("merged")
            and (node.get("source") or node.get("subject"))["repository"]["nameWithOwner"] == "duckdb/duckdb"
            for node in issue["timelineItems"]["nodes"]
        )
        era = ("2.0" if created >= RELEASES["2.0.0"] else
               "1.5" if created >= RELEASES["1.5.0"] else "earlier")
        tenure_days = (created - first).days if first else None
        rows.append(dict(
            number=issue["number"], title=issue["title"],
            url=f"https://github.com/duckdb/duckdb/issues/{issue['number']}",
            created=created, closed=ts(issue["closedAt"]), state=issue["state"],
            reason=issue["stateReason"], author=login, association=issue["authorAssociation"],
            tenure_days=tenure_days, labels=labels, merged_fix=merged_fix, era=era,
            title_mentions=issue["title_mentions_regression"],
        ))
    assert len({r["number"] for r in rows}) == len(rows)
    return rows


def tenure(days):
    if days is None or days <= 30:
        return "New (first issue or PR within 30 days)"
    return "Returning (31 days to a year)" if days <= 365 else "Long-standing (more than a year)"


def open_status(row):
    if "fixed on nightly" in row["labels"]:
        return "Fixed on nightly"
    if row["merged_fix"]:
        return "Merged PR references it"
    if row["labels"] & {"PR submitted", "under review"}:
        return "Fix in review"
    if "reproduced" in row["labels"]:
        return "Reproduced, no fix yet"
    return "Not yet triaged"


def window(rows, start, days=32):
    return [r for r in rows if start <= r["created"] < start + dt.timedelta(days=days)]


def style():
    for font in (ROOT / "scripts/og-images/fonts").glob("NotoSans-*.ttf"):
        font_manager.fontManager.addfont(str(font))
    plt.rcParams.update({"font.family": "Noto Sans", "font.size": 11,
                         "svg.fonttype": "path", "svg.hashsalt": "qf-duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2",
                         "text.color": INK, "axes.labelcolor": INK_2,
                         "xtick.color": INK_2, "ytick.color": INK_2})


def frame(ax):
    ax.set_facecolor(BG)
    ax.grid(axis="y", color=GRID, linewidth=.8, zorder=0)
    ax.set_axisbelow(True)
    for side in ["top", "right", "left"]:
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(RULE)
    ax.tick_params(axis="both", length=0, pad=8, labelsize=9.5)


def titled(mobile, title, short, subtitle, size):
    fig = plt.figure(figsize=size, dpi=100)
    fig.patch.set_facecolor(BG)
    fig.text(.06 if mobile else .055, .945, short if mobile else title,
             fontsize=12.5 if mobile else 17, weight="semibold")
    fig.text(.06 if mobile else .055, .895 if mobile else .89, subtitle, fontsize=10.5, color=INK_2)
    return fig


def save(fig, name, mobile):
    fig.savefig(OUTPUT / f"{name}{'-mobile' if mobile else ''}.svg", facecolor=BG)
    plt.close(fig)


def chart_share(months):
    for mobile in [False, True]:
        fig = titled(mobile, "Regressions as a share of new DuckDB issues",
                     "Regression share of new issues",
                     f"duckdb/duckdb, by month filed · Jul 2025–{LAST_DAY}, 2026",
                     (4.8, 5.2) if mobile else (9.6, 5.2))
        ax = fig.add_axes([.12, .2, .84, .6] if mobile else [.075, .16, .9, .64])
        frame(ax)
        x = list(range(len(months)))
        colors = [SUN_700 if m["month"] >= "2026-10" else MUTED for m in months]
        ax.bar(x, [m["share"] for m in months], width=.72, color=colors, zorder=2)
        for i, m in enumerate(months):
            if m["month"] >= "2026-10" or (not mobile and m["month"] in ("2026-03", "2026-09")):
                ax.text(i, m["share"] + .006, f"{m['share']:.0%}", ha="center", fontsize=9, color=INK)
        ax.yaxis.set_major_formatter(PercentFormatter(1, decimals=0))
        ax.yaxis.set_major_locator(MultipleLocator(.05 if not mobile else .1))
        ax.set_ylim(0, .28)
        labels = [dt.date.fromisoformat(m["month"] + "-01").strftime("%b\n%Y" if m["month"].endswith(("-01", "-07")) else "%b")
                  for m in months]
        ax.set_xticks(x[::2] if mobile else x, labels[::2] if mobile else labels)
        for release in ["1.4.0", "1.5.0", "2.0.0"]:
            key = RELEASES[release].strftime("%Y-%m")
            i = next(j for j, m in enumerate(months) if m["month"] == key)
            ax.annotate(release, (i, .265), ha="center", fontsize=9, color=INK_2,
                        bbox=dict(boxstyle="round,pad=.25", fc=BG, ec=RULE, lw=.8))
        fig.text(.06 if mobile else .055, .035 if mobile else .03,
                 f"November covers Nov 1–{SNAPSHOT_END.day - 1}." if mobile else
                 f"Issues whose title or body mentions “regression”, divided by all issues opened that month. November covers Nov 1–{SNAPSHOT_END.day - 1}.",
                 fontsize=8.5, color=INK_2)
        save(fig, "regression-share", mobile)


def chart_backlog(flow):
    for mobile in [False, True]:
        fig = titled(mobile, "Open regression issues, and how many were filed and closed each week",
                     "Open regression issues", f"duckdb/duckdb · weeks starting Monday, Mar 2–{dt.date.fromisoformat(flow[-1]['week']):%b %-d}, 2026",
                     (4.8, 6.2) if mobile else (9.6, 6.2))
        top = fig.add_axes([.12, .52, .84, .3] if mobile else [.075, .5, .9, .32])
        bottom = fig.add_axes([.12, .14, .84, .3] if mobile else [.075, .12, .9, .3], sharex=top)
        for ax in (top, bottom):
            frame(ax)
        x = list(range(len(flow)))
        top.plot(x, [w["backlog"] for w in flow], color=SUN_700, linewidth=2.2, zorder=3)
        top.set_ylim(0, 100)
        top.yaxis.set_major_locator(MultipleLocator(25))
        top.text(x[-1] - .6, flow[-1]["backlog"], f"{flow[-1]['backlog']} open", ha="right", va="center",
                 fontsize=10, weight="semibold")
        top.set_ylabel("Open at week’s end", fontsize=9.5)
        bottom.bar([i - .2 for i in x], [w["filed"] for w in flow], width=.4, color=SUN_500, label="Filed", zorder=2)
        bottom.bar([i + .2 for i in x], [w["closed"] for w in flow], width=.4, color=FIELD, label="Closed", zorder=2)
        bottom.set_ylim(0, 32)
        bottom.yaxis.set_major_locator(MultipleLocator(10))
        bottom.set_ylabel("Per week", fontsize=9.5)
        bottom.legend(loc="upper left", frameon=False, fontsize=9.5, ncols=2)
        ticks = [i for i, w in enumerate(flow) if dt.date.fromisoformat(w["week"]).day <= 7]
        bottom.set_xticks(ticks, [dt.date.fromisoformat(flow[i]["week"]).strftime("%b") for i in ticks])
        plt.setp(top.get_xticklabels(), visible=False)
        for release in ["1.5.0", "2.0.0", "2.0.1"]:
            d = RELEASES[release].date()
            i = next(j for j, w in enumerate(flow) if dt.date.fromisoformat(w["week"]) <= d < dt.date.fromisoformat(w["week"]) + dt.timedelta(days=7))
            for ax in (top, bottom):
                ax.axvline(i, color=RULE, linewidth=1, linestyle=(0, (2, 2)), zorder=1)
            if not (mobile and release == "2.0.1"):
                top.text(i + (-.3 if release == "2.0.0" else .3), 93, release, fontsize=9, color=INK_2,
                         ha="right" if release == "2.0.0" else "left")
        save(fig, "backlog", mobile)


def chart_adoption(pypi):
    v20 = pypi["share_2_0_by_week_since_2026-10-21"]
    v15 = pypi["share_1_5_by_week_since_2026-03-09"]
    for mobile in [False, True]:
        fig = titled(mobile, "Share of DuckDB downloads from PyPI, by week since release",
                     "PyPI downloads by week since release", "2.0.x from Oct 21, 2026 · 1.5.x from Mar 9, 2026",
                     (4.8, 4.6) if mobile else (9.6, 4.8))
        ax = fig.add_axes([.12, .16, .74, .62] if mobile else [.075, .14, .82, .64])
        frame(ax)
        ax.plot([w["week"] for w in v15], [w["share_pct"] for w in v15], color=FIELD, linewidth=2.2,
                linestyle=(0, (4, 3)), marker="o", markersize=4)
        ax.plot([w["week"] for w in v20], [w["share_pct"] for w in v20], color=SUN_700, linewidth=2.4,
                marker="o", markersize=4.5)
        ax.text(v15[-1]["week"] + .2, v15[-1]["share_pct"], "1.5.x", va="center", fontsize=10, color=INK)
        ax.text(v20[-1]["week"] + .2, v20[-1]["share_pct"], "2.0.x", va="center", fontsize=10, color=INK, weight="semibold")
        ax.set_ylim(0, 60)
        ax.set_xlim(.7, len(v15) + .3)
        ax.yaxis.set_major_locator(MultipleLocator(10 if not mobile else 20))
        ax.yaxis.set_major_formatter(PercentFormatter(100, decimals=0))
        ax.set_xticks(range(1, len(v15) + 1), [f"Wk {i}" if not mobile else str(i) for i in range(1, len(v15) + 1)])
        fig.text(.06 if mobile else .055, .03, f"Week {v20[-1]['week']} of 2.0 has {v20[-1]['days']} days of data. Source: ClickHouse PyPI dataset.",
                 fontsize=8.5, color=INK_2)
        save(fig, "adoption", mobile)


def write_csv(name, data):
    with (OUTPUT / name).open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=data[0].keys(), lineterminator="\n")
        writer.writeheader()
        writer.writerows(data)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = load()
    totals = json.loads((RESEARCH / "issue-totals.json").read_text())
    pypi = json.loads((RESEARCH / "pypi.json").read_text())
    style()

    # Monthly share of new issues.
    by_month = collections.Counter(r["created"].strftime("%Y-%m") for r in rows)
    months = [dict(month=m, regression_issues=by_month[m], all_issues=totals[m],
                   share=by_month[m] / totals[m]) for m in sorted(k for k in totals if k[:2] == "20")]
    chart_share(months)
    write_csv("monthly-share.csv", [{**m, "share": round(m["share"], 4)} for m in months])

    # Weekly flow and backlog (backlog counts every regression issue filed since Jul 2025).
    flow, week = [], dt.datetime(2026, 3, 2, tzinfo=UTC)
    while week + dt.timedelta(days=7) <= SNAPSHOT_END:  # complete weeks only
        end = week + dt.timedelta(days=7)
        flow.append(dict(
            week=week.date().isoformat(), days=(end - week).days,
            filed=sum(week <= r["created"] < end for r in rows),
            closed=sum(bool(r["closed"]) and week <= r["closed"] < end for r in rows),
            backlog=sum(r["created"] < end and (not r["closed"] or r["closed"] >= end) for r in rows)))
        week += dt.timedelta(days=7)
    chart_backlog(flow)
    write_csv("weekly-flow.csv", flow)

    chart_adoption(pypi)
    v20 = {w["week"]: w["share_pct"] for w in pypi["share_2_0_by_week_since_2026-10-21"]}
    write_csv("pypi-adoption.csv", [
        {"week": w["week"], "v2_0_share_pct": v20.get(w["week"], ""), "v1_5_share_pct": w["share_pct"]}
        for w in pypi["share_1_5_by_week_since_2026-03-09"]])

    write_csv("regression-issues.csv", [dict(
        number=r["number"], title=r["title"], url=r["url"], created=r["created"].isoformat(),
        closed=r["closed"].isoformat() if r["closed"] else "", state=r["state"], close_reason=r["reason"] or "",
        era=r["era"], title_mentions_regression=r["title_mentions"], reporter_tenure=tenure(r["tenure_days"]),
        open_status=open_status(r) if r["state"] == "OPEN" else "")
        for r in sorted(rows, key=lambda r: r["number"])])

    # Numbers quoted in the post.
    print("== release windows (32 days) ==")
    for release in ["1.4.0", "1.5.0", "2.0.0"]:
        sub = window(rows, RELEASES[release])
        print(f"  {release}: {len(sub)} regression issues ({sum(r['title_mentions'] for r in sub)} in title) "
              f"of {totals[release + '_32d']} issues = {len(sub) / totals[release + '_32d']:.1%}")
    pre = [r for r in rows if dt.datetime(2026, 7, 1, tzinfo=UTC) <= r["created"] < dt.datetime(2026, 10, 1, tzinfo=UTC)]
    print(f"  Jul-Sep 2026: {len(pre)} of {totals['pre2_3mo']} = {len(pre) / totals['pre2_3mo']:.1%}")

    print("== flow since 2.0.0 ==")
    since = [w for w in flow if w["week"] >= "2026-10-19"]
    print(f"  filed {sum(w['filed'] for w in since)}, closed {sum(w['closed'] for w in since)}, "
          f"backlog {next(w['backlog'] for w in flow if w['week'] == '2026-10-12')} -> {flow[-1]['backlog']}")
    print(f"  open at snapshot end: {sum(not r['closed'] or r['closed'] >= SNAPSHOT_END for r in rows)}")
    print(f"  weeks where filed > closed: {sum(w['filed'] > w['closed'] for w in since)} of {len(since)}")
    before = [w for w in flow if "2026-07-06" <= w["week"] < "2026-10-19"]
    print(f"  mean closed/week Jul 6-Oct 18: {statistics.mean(w['closed'] for w in before):.1f}; since 2.0: {statistics.mean(w['closed'] for w in since):.1f}")

    print("== 2.0-era issues ==")
    era20 = [r for r in rows if r["era"] == "2.0"]
    opened = [r for r in era20 if r["state"] == "OPEN"]
    print(f"  {len(era20)} filed, {len(opened)} open: {collections.Counter(open_status(r) for r in opened).most_common()}")
    for era in ["1.5", "2.0"]:
        days = [(r["closed"] - r["created"]).total_seconds() / 86400 for r in rows
                if r["era"] == era and r["closed"] and r["reason"] == "COMPLETED"]
        print(f"  {era}: median {statistics.median(days):.1f} days to close as completed (n={len(days)})")
    era15 = [r for r in rows if r["era"] == "1.5"]
    print(f"  1.5 era: {len(era15)} filed, {sum(r['state'] == 'OPEN' for r in era15)} still open")

    print("== reporters ==")
    for label, sub in [("1.5.0 first 32 days", window(rows, RELEASES["1.5.0"])), ("1.5 era", era15), ("2.0 era", era20)]:
        people = collections.Counter(r["author"] for r in sub)
        top5 = sum(c for _, c in people.most_common(5))
        mix = collections.Counter(tenure(r["tenure_days"]) for r in sub)
        staff = sum(r["association"] in ("MEMBER", "OWNER", "COLLABORATOR") for r in sub)
        print(f"  {label}: {len(sub)} issues, {len(people)} people, max {people.most_common(1)[0][1]}, "
              f"top five {top5 / len(sub):.0%}, staff {staff}; " +
              ", ".join(f"{k.split(' (')[0]} {v / len(sub):.0%}" for k, v in sorted(mix.items())))


if __name__ == "__main__":
    main()
