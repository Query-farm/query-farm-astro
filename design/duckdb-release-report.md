# DuckDB 2.0 release report prototype

Local route: `/research/duckdb-2-release-activity/`. The route follows the blog's
draft convention: available in development or with `INCLUDE_DRAFTS=true`, excluded
from an ordinary production build. It is marked noindex during prototyping.

The primary action is **Discuss your DuckDB project**, leading to the existing
`/company/schedule` page. A project-brief email link is the alternative contact
path. Newsletter signup is secondary, with both a dedicated-page link and the
shared Buttondown form. No signup is required to read or download the evidence.

## Evidence and regeneration

The report opens with the upgrade question and DuckDB's own migration guidance,
then presents the calendar, release-aligned issue benchmark, package distribution,
repository comparisons, first-time reporters and contributor trends. Findings
are visible without using controls. Charts gain hover details when in view;
Matplotlib figures and all tables remain available without JavaScript.

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
`release_design.py` calculations and the carousel's palette and fonts.
The JSON records the collection time and SHA-256 of the downloadable aligned CSV.
`issue-calendar.csv` retains raw daily issue counts and trailing seven-day means.
`package-comparison.csv` includes all 46 repositories, each release's actual and
weekday-matched expected counts, and baseline-availability flags. The visible
table includes every repository with an issue in the 2.0 window. Ratios are
withheld for zero expectations or when saved history does not establish activity
before the baseline began. This does not infer repository creation dates.
The exporter reconciles repository counts and expectations against the existing
scope-level analysis for all three releases. Issue location is not a confirmed
affected component/version or regression classification. Small denominators
remain visible next to large multiples.

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
