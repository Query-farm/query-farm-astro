---
title: "DuckDB 2.0.1 Is Out: Upgrade Now or Wait for 2.0.2?"
description: "DuckDB 2.0.1 is out. Regressions are being fixed faster than before, but new reports still outpace fixes. Test on 2.0; keep production on 1.5 for now."
pubDate: 2026-11-24
author: "Query Farm Team"
tags: ['DuckDB', 'Releases']
draft: true
showDescription: false
showTableOfContents: false
heroImage: '/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/social.png'
heroImageAlt: 'DuckDB 2.0.1 Is Out: Upgrade Now or Wait for 2.0.2? A cut-paper collage of a tidy green stack of fixes stitched into two release slabs, a heap of open reports beside them, and an empty frame for the next release, by Query.Farm.'
leadVisual:
  src: '/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regressions-artwork.webp'
  alt: ''
  width: 1440
  height: 480
thumbnail: '/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regression-share.svg'
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li>In the month after 2.0.0, 21% of new DuckDB issues reported a regression. Before the release it was about 12%; after 1.5.0, 13%.</li>
      <li>Maintainers are closing regressions faster than they did over the summer, but new reports have outpaced closures every week since the release. The open count went from 48 to 91.</li>
      <li>The 76 regressions filed since 2.0.0 came from 57 people. Nobody filed more than four.</li>
      <li>Four weeks in, 2.0 had 19% of DuckDB downloads from PyPI. 1.5 had 50% at the same point.</li>
    </ul>
  </div>
</aside>

A month ago we asked whether to [upgrade to DuckDB 2.0 now or wait for 2.0.1](/blog/duckdb-2-release-activity/). We said we'd be more cautious about 2.0.1 if new reports stayed high or we saw no evidence of fixes. DuckDB 2.0.1 came out on November 20, so it's time to check.

That first post counted every issue. It couldn't say how many were regressions, or whether anyone was fixing them. This time we took every issue in [`duckdb/duckdb`](https://github.com/duckdb/duckdb) that mentions a regression and looked at when it was filed, who filed it, and whether it has been closed.

There is plenty of evidence of fixes, and new reports are still high. Because 2.0 is DuckDB's [long-term support release](https://duckdb.org/release_calendar), that matters more than it would for a short-lived version. Until the trend changes, we're testing on 2.0 and keeping production on 1.5.

A disclosure: we build on DuckDB 2.0. [Our extensions ship for it](/blog/duckdb-2-query-farm-repository/) from our own repository, and our team filed four of the regressions counted here.

## Regressions are a bigger share of new issues

Issue volume in `duckdb/duckdb` has roughly tripled in a year, so raw counts mislead. We looked instead at the share of new issues that mention a regression.

From February to September 2026 that share was mostly between 10% and 15%. In the 32 days after 2.0.0 it was **21%, 73 of 346 issues**. The same window after 1.5.0 was 13%, and after 1.4.0 it was 4%. November is running at 24% so far.

Part of that is the cost of a big release. A major long-term support version gets tested by far more people than a point release, and more testing finds more regressions. But the share already accounts for volume: July through September was busy too, with 738 new issues, and 12% of them were regressions.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regression-share-mobile.svg" width="480" height="520" />
    <img src="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regression-share.svg" alt="Bar chart of the monthly share of new duckdb/duckdb issues that mention a regression, July 2025 to November 2026. The share is mostly between 10 and 15 percent from February to September 2026, then rises to 17 percent in October and 24 percent in November, after the 2.0.0 release." width="960" height="520" loading="lazy" />
  </picture>
  <figcaption>Issues whose title or body mentions “regression”, as a share of all issues opened each month. October includes the 20 days before 2.0.0. November covers November 1–23. <a href="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/monthly-share.csv">Monthly figures</a>.</figcaption>
</figure>

Matching on the word "regression" catches some issues that aren't strictly regressions. Counting only titles gives the same picture: 37 in 2.0's first month, against 10 after 1.5.0.

## They're being fixed, and the backlog is still growing

Since 2.0.0 shipped, maintainers have closed about eight regression issues a week, up from about five over the summer. The ones closed as fixed took a median of five days, though newer issues have had less time to close.

Reports have come in faster. In the five weeks starting with release week, 85 regression issues were filed and 41 were closed, and new reports outnumbered closures in every one of those weeks. The open count went from 48 the week before release to 92 by November 22. A day later it was 91, and 49 of those were filed since 2.0.0.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/backlog-mobile.svg" width="480" height="620" />
    <img src="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/backlog.svg" alt="Two-panel chart of regression issues in duckdb/duckdb by week from March to November 2026. The top panel shows the open count rising from 8 in March to about 50 by October, then jumping to 92 after the 2.0.0 release. The bottom panel shows weekly filed and closed counts; filings spike to 30 in release week and exceed closures in that week and every week after." width="960" height="620" loading="lazy" />
  </picture>
  <figcaption>Open regression issues at the end of each week, and how many were filed and closed that week. Weeks start on Monday. The open count includes every regression issue filed since July 2025. <a href="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/weekly-flow.csv">Weekly figures</a>.</figcaption>
</figure>

The open count was already rising over the summer. After the release it jumped.

Of the 49 regressions filed since 2.0.0 that are still open, 21 have been reproduced and are waiting on a fix, 25 haven't been triaged yet, and 3 have a merged fix but haven't been closed. Some are serious:

- [#27641](https://github.com/duckdb/duckdb/issues/27641): `sum()` over a `LEFT JOIN` with an empty right side returns the wrong result.
- [#27803](https://github.com/duckdb/duckdb/issues/27803): `LIMIT` is dropped and `EXISTS` returns false over a filtered `LEFT JOIN` onto an empty table.
- [#28093](https://github.com/duckdb/duckdb/issues/28093): an uncorrelated scalar subquery inside a correlated one repeats the inner aggregate once per outer row, making the query over 1,000 times slower than on 1.5.6.

All three have been reproduced and were still open when we checked on November 24.

DuckLabs keeps a tidy tracker, so the closure counts mean something. We looked at a sample of issues closed without a linked pull request, and each one said in its comments how it was resolved: a fix, a duplicate, or intended behavior.

## Who's filing them

If one person were filing most of these, the numbers would say more about that person than about the release. That isn't the case. The 76 regressions filed since 2.0.0 came from 57 people. Nobody filed more than four, and the five most active reporters account for about a quarter, about the same as in the 1.5 era.

| | After 1.5.0 (32 days) | 1.5 era | Since 2.0.0 |
| :-- | --: | --: | --: |
| Regression issues | 23 | 167 | 76 |
| People filing them | 21 | 105 | 57 |
| Most from one person | 2 | 12 | 4 |
| Filed by someone new (first issue or PR in the past 30 days) | 78% | 55% | 55% |
| Filed by someone active for more than a year | 4% | 25% | 21% |

The 1.5 era runs from March 9 to October 20, 2026. "New" and "active" come from each reporter's earliest issue or pull request in `duckdb/duckdb`.

Just over half come from people new to the tracker, much like the 1.5 era as a whole. The change from 1.5.0's first month is in longer-standing reporters: a fifth of 2.0's regressions came from people active in `duckdb/duckdb` for more than a year, against 4% after 1.5.0.

## What's in 2.0.1

DuckLabs [describes 2.0.1](https://github.com/duckdb/duckdb/releases/tag/v2.0.1) as "a bug fix release for various issues discovered after we released v2.0.0." Three days after 2.0.1 shipped, most of the 2.0 regressions above were still open.

So far, 2.0.1 accounts for about half of 2.0 downloads from PyPI. Three days after 1.5.1 came out, it had 86% of 1.5 downloads. It's early, and versions pinned in lockfiles and CI could explain much of the difference.

## Adoption is slower

Four weeks after release, 2.0 accounted for 19% of DuckDB downloads from PyPI. At the same point, 1.5 had 50%.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/adoption-mobile.svg" width="480" height="460" />
    <img src="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/adoption.svg" alt="Line chart of the share of DuckDB downloads from PyPI by week since release. DuckDB 1.5 rises from 31 percent in week one to about 50 percent by week four and stays there. DuckDB 2.0 rises from 13 percent to 22 percent by week five." width="960" height="480" loading="lazy" />
  </picture>
  <figcaption>Share of <code>duckdb</code> downloads from PyPI on each release line, by week since its first release. <a href="/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/pypi-adoption.csv">Weekly figures</a>.</figcaption>
</figure>

Some caution with a major version is normal, and this data can't tell us why people are waiting. The regressions are why we would.

## What we're watching for 2.0.2

DuckDB's [release calendar](https://duckdb.org/release_calendar) doesn't list a date for 2.0.2 yet. When it comes, these are the things that would change our view:

- Weekly closures overtaking new regression reports, and the open count falling.
- The 25 untriaged 2.0 regressions getting triaged.
- A 2.0.2 changelog that fixes bugs like the three above.
- 2.0's share of PyPI downloads moving up.

There's time to wait. DuckDB 1.5 is supported until March 2027. Support for 1.4 ended on November 17, so if you're still on 1.4, 1.5.6 is the more conservative next step for now.

When those signals turn, we'll say so. Until then, test on 2.0, file what you find, and keep production on 1.5.

## Method and data

A regression issue is an issue in `duckdb/duckdb` whose title or body mentions "regression", found with GitHub search for July 2025 through November 23, 2026, with bots excluded. We assign each issue to the release that was current when it was filed. We didn't check each report's version field, so some issues filed after 2.0.0 may concern nightly builds or 1.5.x. Release-window comparisons use the 32 days from each release's publication time. Shares divide by all issues opened in the same window.

Open and closed status, close reasons, labels, and linked pull requests come from GitHub on November 24, 2026. Newer issues have had less time to be closed. A reporter's tenure is measured from their earliest issue or pull request in `duckdb/duckdb`.

PyPI downloads come from the public ClickHouse PyPI dataset (`pypi.pypi_downloads_per_day_by_version`, project `duckdb`).

**Download the data (CSV):**

- [Every regression issue, with its status and reporter tenure](/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/regression-issues.csv)
- [Monthly regression share of new issues](/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/monthly-share.csv)
- [Weekly filed, closed and open counts](/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/weekly-flow.csv)
- [PyPI download share by week since release](/media/posts/duckdb-2-0-1-upgrade-now-or-wait-for-2-0-2/pypi-adoption.csv)
