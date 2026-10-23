---
title: "DuckDB 2.0 and the Query Farm extension repository"
description: "Query Farm now distributes its DuckDB 2.0 extensions through its own repository. Here's how to install them and why we're changing how we deliver releases."
pubDate: 2026-10-22
author: "Query Farm Team"
tags: ['DuckDB', 'Extensions', 'Distribution']
draft: false
showDescription: false
showTableOfContents: false
heroImage: '/media/posts/duckdb-2-query-farm-repository/social.png'
heroImageAlt: 'DuckDB 2.0 and the Query Farm extension repository, with an abstract collage of textured gold, green, and umber shapes'
leadVisual:
  src: '/media/posts/duckdb-2-query-farm-repository/extensions-artwork.webp'
  alt: ''
  width: 1440
  height: 480
---

DuckDB 2.0 is out, and Query Farm's extensions now have their own extension repository. To install [A5](/products/extensions/a5/), [Airport](/products/extensions/airport/), or another of our [DuckDB extensions](/products/extensions/), use `INSTALL extension_name FROM query_farm`.

The DuckDB team made this possible with 2.0's [support for custom extension repositories](https://duckdb.org/docs/2.0/extensions/extension_repositories). We can sign and distribute our own builds, and DuckDB verifies them against our repository's signing keys.

Add the Query Farm repository once, then install the extensions you need. Here's the complete setup for A5:

```sql
SET allow_extension_repositories = 'allowed';

CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
    WITH PREFIX 'https://duckdb-extensions.query.farm';

INSTALL a5 FROM query_farm;
LOAD a5 FROM query_farm;
```

Use `LOAD a5 FROM query_farm` in subsequent sessions. Replace `a5` with another Query Farm extension's name to install and load it. This change applies to DuckDB 2.0 and later; earlier DuckDB versions continue to use `community`.

We're making this move because we support these extensions, and we need to control when fixes reach the people using them. Until now, a release in our source repository needed a separate pull request to [`duckdb/community-extensions`](https://github.com/duckdb/community-extensions) before it could be distributed there. DuckDB's maintainers review submissions and manage builds for many independent projects. That shared infrastructure has helped our extensions reach a lot of people.

The difficulty for us has been predicting when an update will become available. Some updates have waited over a weekend: our [crypto compatibility update for DuckDB 1.5](https://github.com/duckdb/community-extensions/pull/1265) opened on Friday, February 13, and merged on Monday, February 16, about 68 hours later. The DuckDB team has a whole ecosystem to look after. Meeting our customers' release deadlines is our responsibility.

We [examined these turnaround times in June](/blog/duckdb-community-extensions-distribution/). The updated analysis covers 1,988 merged PRs through September. In September alone, the median was **28 hours**, while the slowest 10% took **more than four days** to merge. Those timings include CI and revisions by extension authors, ourselves included. They don't isolate review delays or measure when binaries became available.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-query-farm-repository/merge-times-mobile.svg" width="480" height="550" />
    <img src="/media/posts/duckdb-2-query-farm-repository/merge-times.svg" alt="Monthly time to merge for 1,988 community-extension PRs, October 2025 through September 2026. The median ranges from about four to fifty hours; the 90th percentile ranges from nineteen to 128 hours. September’s median is 28 hours and its 90th percentile is 102 hours." width="960" height="560" loading="lazy" />
  </picture>
  <figcaption>Time from opening to merge for all PRs merged to <code>duckdb/community-extensions</code>, October 2025–September 2026, grouped by merge month. Includes extension updates, documentation, and infrastructure changes. <a href="/media/posts/duckdb-2-query-farm-repository/merged-prs.csv">PR data</a> · <a href="/media/posts/duckdb-2-query-farm-repository/monthly-merge-times.csv">Monthly figures</a>.</figcaption>
</figure>

Our own repository lets us build, test, sign, and publish on a schedule we control. It also makes us responsible for operating that distribution infrastructure and resolving problems with it.

We've also created small stub extensions for the community repository to help people following older installation instructions. The [A5 stub](https://github.com/Query-farm/a5/blob/f3e8fba2b615b6e4cface8aedc85dfdd8b943ba7/src/a5_extension.cpp) explains how to add our repository and install the extension. If you've already done that, it loads the Query Farm build. It doesn't add a repository or download code on your behalf; choosing to trust our repository remains your decision.

We're still committed to DuckDB and its community. Taking on distribution is how we can better support everyone using our extensions, whether they're customers or working on their own projects.

**[Browse Query Farm's DuckDB extensions](/products/extensions/)** and try one with the setup above. If you maintain a DuckDB extension and want details about running a repository or handling the transition, [get in touch](mailto:hello@query.farm). We're happy to share what we've learned.
