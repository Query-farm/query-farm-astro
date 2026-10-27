# DuckDB 2.0 release report prototype

Local route: `/blog/duckdb-2-release-activity/`. The article is an MDX entry in
the blog collection; the old `/research/duckdb-2-release-activity/` route redirects
to it. It follows the blog's draft convention: available in development or with `INCLUDE_DRAFTS=true`, excluded
from an ordinary production build. It is marked noindex during prototyping.

The primary action is **Discuss your DuckDB project**, leading to the existing
`/company/schedule` page. A project-brief email link is the alternative contact
path. Newsletter signup is secondary, with both a dedicated-page link and the
shared Buttondown form. No signup is required to read or download the evidence.

## Evidence and regeneration

The report opens with the upgrade question and DuckDB's own migration guidance,
then presents the calendar, release-aligned issue benchmark, first-time reporters,
package distribution, repository links and contributor trends. The normal blog
title and byline replace the report masthead. The cutoff and preliminary status are recorded in the methods; the opening
frames the upgrade and patch-release questions before investigating the data. Findings
are visible without using controls. Charts gain hover details when in view;
Matplotlib figures and repository lists remain available without JavaScript.

The seven measures, two baselines, and two chart views come from the saved
`duckdb-velocity-analysis` snapshot. The report does not fetch GitHub in the
browser or at Astro build time. Daily bins, release day 0, actual observation
endpoints, and ratios of summed actual to summed expected are preserved.

Regenerate the data, Matplotlib SVG figures, 1200×630 social card, CSVs, repository
inventory, and local Plotly bundle from the analysis checkout:

```sh
uv run python web_report.py --site ../query-farm-astro
```

Source: `../duckdb-velocity-analysis/web_report.py`, using the dashboard's
`release_design.py` calculations and the carousel's fonts, with a separate web palette.
The JSON records the collection time and SHA-256 of the downloadable aligned CSV.
`issue-calendar.csv` retains raw daily issue counts and trailing seven-day means.
The calendar uses a blue activity line and pale blue area, dark gray release
markers and boxed major-release labels; minor-release labels have no border on
this dense calendar. Relative charts use larger legends, boxed release labels
and a centered day-zero label. Every comparison legend lists versions only.
Nearby patch releases have dark gray vertical lines as well as boxed labels.
The issue benchmark also shows a dotted line for
the planned 2.0.1 release, taken from the saved release calendar; no future 2.0
activity is fabricated. Each figure, title and caption sits inside one bordered
panel on a lighter `#fffdf7` canvas. Comparison colors are navy `#004488`, rust
`#b44b32` and teal `#137c78`, with dotted, dashed and solid lines respectively;
2.0 has the heavier stroke. Contrast against that canvas is 9.46:1, 5.17:1 and
4.94:1. The calendar retains the requested blue line and pale blue fill.
Neutral gray gridlines separate the chart from the site's warm gold accents.
This uses the qualitative-palette and redundant-encoding principles discussed
in [Paul Tol's colour-scheme guidance](https://sronpersonalpages.nl/~pault/data/colourschemes.pdf);
the custom palette is not claimed to have passed a color-vision simulation.
Static and interactive charts use the same treatment.
`package-comparison.csv` includes all 46 repositories, each release's actual and
weekday-matched expected counts, and baseline-availability flags. On the page,
repository links are grouped by engine, clients, extensions, ecosystem and docs,
in two compact columns. The main list includes active repositories with an
established baseline, at least one expected issue, and observed issues above
expectation. This is a descriptive filter, not a significance test or a severity
classification. Active repositories with expectations below one issue or
unestablished baselines are listed separately. The package section intentionally
has no ratio ranking or numeric matrix. The calendar and release benchmarks
remain visible above it; exact package comparisons are in the CSV. Ratios are
withheld for zero expectations or when saved history does not establish activity
before the baseline began. This does not infer repository creation dates.
The exporter reconciles repository counts and expectations against the existing
scope-level analysis for all three releases. Issue location is not a confirmed
affected component/version or regression classification. Exact counts and
expectations remain available in the downloadable evidence.

`group-comparison.csv` exports all five repository groups, three releases and
both baselines. The 2.0 core comparison is 127 / 49.75 = 2.55×, versus 37 / 11.25
= 3.29× at 1.5. Using the recent baseline gives 2.38× versus 3.02×. Clients and
installers have 27 / 11.25 = 2.40× under the main baseline and 27 / 14 = 1.93×
under the recent one. Client activity exceeds its own baseline under both;
whether it exceeds 1.5's response changes with the baseline. Do not claim that
engine intake is below normal, that clients have a historically exceptional
response, or that these are defect rates. These groups describe where reports
were filed, not which component caused a problem. All 30 exported rows were
independently checked against the materialized DuckDB tables with UTC boundaries.

The article links the [VGI connector](https://github.com/Query-farm/vgi-github)
and [VGI](https://query.farm/vgi/). More reporters includes more first-observed
reporters; a wider mix of users or workloads has not been established.
GitHub's [Copilot workflow](https://github.blog/ai-and-ml/github-copilot/from-idea-to-pr-a-guide-to-github-copilots-agentic-workflows/)
supports the statement that AI can simplify issue creation, but this dataset
does not measure AI use. DuckDB's [2.0 static-linking documentation](https://duckdb.org/docs/2.0/dev/building/linking_extensions)
documents client build adaptations. Those changes are a plausible contributor
to integration problems, not an established cause of the aggregate issue rise.

The migration guidance and release planning dates were reviewed against official
DuckDB sources on 2026-10-27. Review this editorial copy, support dates, and package
interpretations when refreshing the data; the exporter does not fetch release
guidance or classify individual issue contents.
Commit the exporter and exported assets together when refreshing this report.
The vendored Plotly bundle retains its upstream MIT license header.

The page uses the site's BaseLayout metadata, canonical URL, organization
attribution, and a dedicated Open Graph / Twitter card. It is a preliminary
report; observation dates stay visible without a separate small-sample warning.

## Analytics

The existing GA4 property is `G-EZ01WJETLF`. No second tag is installed. Events
are emitted only on `query.farm` / `www.query.farm` when the existing `gtag` is
available; localhost, preview domains, and blocked analytics remain inert.

| Event | Trigger | Meaning |
| --- | --- | --- |
| `newsletter_click` | Following the newsletter page link | Interest in subscribing |
| `newsletter_submit` | A browser-valid native Buttondown form submission | A submitted signup request, **not** confirmed opt-in |
| `consultation_click` | Report booking or project-email link | Intent to discuss a project, **not** a booked meeting |

Parameters include `content_id`, `placement`, and `method`. Newsletter submissions
also include `newsletter_name=queryfarm-dispatch` and
`subscription_status=submitted`. No email, form content, or arbitrary query-string
values are sent to GA. Report attribution is carried to the newsletter page via
the allowlisted `source=duckdb-2-release-activity` value and saved as Buttondown
subscriber metadata. Native submission preserves Buttondown CAPTCHA and error
handling. Rapid duplicate submit events are suppressed.

Confirmed subscription conversions require a Buttondown-side confirmation or
webhook integration; this prototype does not falsely report them from button
clicks or submissions. In GA4, register `content_id`, `placement`, and
`subscription_status` as event-scoped dimensions to break down these events.
Property configuration and live event delivery were not changed or exercised.

Official references:
- https://docs.buttondown.com/building-your-subscriber-base
- https://developers.google.com/analytics/devguides/collection/ga4/events

## Verification

```sh
node --import tsx --test tests/release-report/analytics.test.ts
npm run check
INCLUDE_DRAFTS=true npm run build
```

Use HTTP and rendered HTML checks for the local route and its linked assets.
Review the scientific figures directly; no Playwright or browser automation.
