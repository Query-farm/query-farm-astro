---
title: "DuckDB 1.5 and 2.0 extension availability"
description: "Comparing DuckDB 1.5.5 with 2.0.0 finds 84 extension names missing from 2.0.0 and 70.2% retention. See the full missing list and 50 names available only on 2.0.0 across the releases checked."
pubDate: 2026-11-05
author: "Query Farm Team"
tags: ['DuckDB', 'Extensions', 'Distribution']
draft: false
showDescription: false
showTableOfContents: false
showLeadVisual: false
heroImage: '/media/posts/duckdb-2-extension-availability/social.png'
heroImageAlt: 'DuckDB 1.5 and 2.0 extension availability, an analysis by Query.Farm'
thumbnail: '/media/posts/duckdb-2-extension-availability/availability.svg'
---

DuckDB's extension ecosystem has new capabilities, but upgrading the engine still leaves gaps in the extension catalog. The important question for an existing application is whether its dependencies are available on the new release.

On **November 5, 2026**, we checked published extension artifacts for DuckDB **1.5.5, 1.5.6, and 2.0.0** across five platforms. Using **1.5.5 as the baseline**, we found **282 extension names for 1.5.5 and 274 for 2.0.0**. That looks close. But only **198 names appear in both sets**: **70.2%** of the 1.5.5 set carries forward, while **84 names lack a 2.0.0 artifact in the repositories we checked**.

This comparison covers extensions for **upstream DuckDB** from the community catalog and Query Farm's DuckDB repository. Haybarn builds are not included. “Available” means a published artifact for the specified engine and platform; it does not establish that the extension loads successfully or that its queries behave identically.

## Why we use 1.5.5 as the baseline

The two 1.5 patches have similar totals, but different sets of extensions. **31 names with a 1.5.5 artifact have no 1.5.6 artifact** on any of the five platforms. Another 30 names appear in 1.5.6 without a 1.5.5 artifact. The near-identical totals, 282 and 281, conceal that turnover.

For example, `duckgql`, `orc`, and `zarr` have artifacts for 1.5.5 and 2.0.0, but none for 1.5.6 in this snapshot. Comparing only with 1.5.6 would classify them as additions to the 2.0.0 set. The missing files establish an availability gap; this snapshot alone cannot tell us whether a build failed or why an artifact was not published.

## Similar totals hide substantial turnover

The overall change from 1.5.5 to 2.0.0 is small: eight fewer names, or 2.8%. The overlap tells a different story.

<figure style="max-width: 600px;">
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-extension-availability/overlap-mobile.svg" width="480" height="400" />
    <img src="/media/posts/duckdb-2-extension-availability/overlap.svg" alt="Area-proportional overlap diagram for DuckDB 1.5.5 and 2.0.0. Of 358 distinct extension names, 198 are available for both versions, 84 for 1.5.5 but not 2.0.0, and 76 for 2.0.0 but not 1.5.5. The version totals are 282 and 274 respectively." width="640" height="534" loading="lazy" />
  </picture>
  <figcaption>Circle and overlap areas are proportional to counts: 282 names for 1.5.5, 274 for 2.0.0, and 198 shared. The 76 on the right are absent from 1.5.5; 26 already have 1.5.6 builds.</figcaption>
</figure>

| Availability across the five tested platforms | Extension names |
| :-- | --: |
| Both 1.5.5 and 2.0.0 | 198 |
| In 1.5.5 but not 2.0.0 | 84 |
| In 2.0.0 but not 1.5.5 | 76 |

The 76 names added to the compared set almost offset the 84 missing names. They do not replace those dependencies for someone upgrading an existing application. A new extension for a different task cannot make a missing connector work.

Of those 76 additions relative to 1.5.5, **26 already have 1.5.6 builds**. That leaves **50 names available only on 2.0.0 across the three releases checked**. We list both groups below so an extension that reached 1.5.6 is not described as exclusive to 2.0.0.

Even that 70.2% overlap is a generous measure of upgrade continuity: it counts a name if it has a build on *any* tested platform in each version. An application needs its extensions on the platform where it actually runs.

## Availability depends on the platform

All five platforms have fewer available names in 2.0.0 than in 1.5.5. WebAssembly has the largest proportional shortfall, dropping from 150 names to 124, or 17.3%.

<figure>
  <picture>
    <source media="(max-width: 600px)" srcset="/media/posts/duckdb-2-extension-availability/availability-mobile.svg" width="480" height="700" />
    <img src="/media/posts/duckdb-2-extension-availability/availability.svg" alt="Published extension artifacts for DuckDB 1.5.5 and 2.0.0 by platform. Linux x64: 281 and 273; Linux ARM64: 276 and 264; Apple Silicon: 279 and 269; Windows x64: 242 and 228; WebAssembly EH: 150 and 124. Known migration stubs are replaced by destination builds where present." width="960" height="600" loading="lazy" />
  </picture>
  <figcaption>Published artifacts on November 5. The 2.0.0 counts exclude known Query Farm migration stubs and include the corresponding builds from our repository where present.</figcaption>
</figure>

| Platform | 1.5.5 | 1.5.6 | 2.0.0 | 1.5.5 names retained in 2.0.0 |
| :-- | --: | --: | --: | --: |
| Linux x64 | 281 | 280 | 273 | 70.1% |
| Linux ARM64 | 276 | 274 | 264 | 69.6% |
| macOS Apple Silicon | 279 | 277 | 269 | 70.3% |
| Windows x64 | 242 | 237 | 228 | 68.6% |
| WebAssembly EH | 150 | 144 | 124 | 65.3% |

Retention measures the same names on the same platform. On Linux x64, for example, 197 of the 281 names available for 1.5.5 have a 2.0.0 artifact. The other 76 names in the 2.0.0 total are additions to that platform's compared set.

WebAssembly here means `wasm_eh`; it does not represent every Wasm build or establish compatibility with a particular browser client.

## Available in 1.5.5 but missing from 2.0.0

These **84 names** have a 1.5.5 artifact on at least one selected platform and no 2.0.0 artifact on any of them in the repositories checked. The list includes `gsheets`, `hive_metastore`, `duckdb_rdkit`, and `substrait`. Absence here does not establish that a project is abandoned or that no alternative distribution exists.

<ul data-extension-comparison="missing_from_target" style="columns: 2 14rem; column-gap: 2rem; font-size: 0.875em;">
  <li><code>agent_data</code></li>
  <li><code>altertable</code></li>
  <li><code>anndata</code></li>
  <li><code>astro</code></li>
  <li><code>blockduck</code></li>
  <li><code>bvh2sql</code></li>
  <li><code>chaos</code></li>
  <li><code>chsql_native</code></li>
  <li><code>cityjson</code></li>
  <li><code>clamp</code></li>
  <li><code>cloudwatch</code></li>
  <li><code>cog</code></li>
  <li><code>crawler</code></li>
  <li><code>cwiqduck</code></li>
  <li><code>dash</code></li>
  <li><code>datadog</code></li>
  <li><code>decimal_arithmetic</code></li>
  <li><code>documentdb</code></li>
  <li><code>dta</code></li>
  <li><code>duck_delta_share</code></li>
  <li><code>duck_lineage</code></li>
  <li><code>duckdb_rdkit</code></li>
  <li><code>duckdb_rphonetic</code></li>
  <li><code>ducklake_cdc</code></li>
  <li><code>ducknng</code></li>
  <li><code>ducksync</code></li>
  <li><code>dynamodb</code></li>
  <li><code>eenddb</code></li>
  <li><code>erpl_idoc</code></li>
  <li><code>erpl_web</code></li>
  <li><code>fit</code></li>
  <li><code>fivetran</code></li>
  <li><code>gcloud_observability</code></li>
  <li><code>geography</code></li>
  <li><code>ggsql</code></li>
  <li><code>gh</code></li>
  <li><code>gorz</code></li>
  <li><code>gsheets</code></li>
  <li><code>harbor</code></li>
  <li><code>hex9</code></li>
  <li><code>hive_metastore</code></li>
  <li><code>holtfs</code></li>
  <li><code>hostfs</code></li>
  <li><code>interlis</code></li>
  <li><code>ion</code></li>
  <li><code>jev</code></li>
  <li><code>jsono</code></li>
  <li><code>keboola</code></li>
  <li><code>ldbc_data_gen</code></li>
  <li><code>lerobot</code></li>
  <li><code>level_pivot</code></li>
  <li><code>livetennis</code></li>
  <li><code>lpts</code></li>
  <li><code>nsv</code></li>
  <li><code>opendal</code></li>
  <li><code>osmium</code></li>
  <li><code>pac</code></li>
  <li><code>parser_tools</code></li>
  <li><code>pbix</code></li>
  <li><code>pfc</code></li>
  <li><code>pic2vec</code></li>
  <li><code>pivot_table</code></li>
  <li><code>pst</code></li>
  <li><code>psyduck</code></li>
  <li><code>quack_flamegraph</code></li>
  <li><code>quackformers</code></li>
  <li><code>quackhole</code></li>
  <li><code>quackscale</code></li>
  <li><code>quackstore</code></li>
  <li><code>rawduck</code></li>
  <li><code>read_dbf</code></li>
  <li><code>read_stat</code></li>
  <li><code>rocket</code></li>
  <li><code>splunk</code></li>
  <li><code>spxlsx</code></li>
  <li><code>storage_compat</code></li>
  <li><code>substrait</code></li>
  <li><code>superhuman_docs</code></li>
  <li><code>table_guard</code></li>
  <li><code>three_d</code></li>
  <li><code>title_mapper</code></li>
  <li><code>toml</code></li>
  <li><code>tsfile</code></li>
  <li><code>waddle</code></li>
</ul>

A name missing from your platform can also be a blocker even if it is absent from this overall list.

## Available only in 2.0.0

These **50 names** have a 2.0.0 artifact and no artifact for **either 1.5.5 or 1.5.6** on the selected platforms. “Only” refers to the versions and repositories checked, not the project's creation date.

<ul data-extension-comparison="only_in_target" style="columns: 2 14rem; column-gap: 2rem; font-size: 0.875em;">
  <li><code>agent_runs</code></li>
  <li><code>apt</code></li>
  <li><code>biosignals</code></li>
  <li><code>bloom</code></li>
  <li><code>cardinal</code></li>
  <li><code>compression_fs</code></li>
  <li><code>coworkingview</code></li>
  <li><code>cpt</code></li>
  <li><code>decide</code></li>
  <li><code>decide_onnx</code></li>
  <li><code>decision_tune</code></li>
  <li><code>docn</code></li>
  <li><code>dp</code></li>
  <li><code>drex</code></li>
  <li><code>dryrun</code></li>
  <li><code>duck_lk</code></li>
  <li><code>duck_pinyin</code></li>
  <li><code>duckboost</code></li>
  <li><code>duckbridge</code></li>
  <li><code>duckdbi</code></li>
  <li><code>duckfn_open</code></li>
  <li><code>duckfn_palette</code></li>
  <li><code>duckomo</code></li>
  <li><code>eviltransform</code></li>
  <li><code>factorize</code></li>
  <li><code>geosupport</code></li>
  <li><code>gtfs</code></li>
  <li><code>html_query</code></li>
  <li><code>html_readability</code></li>
  <li><code>http_request</code></li>
  <li><code>improv</code></li>
  <li><code>ivf</code></li>
  <li><code>jasp_ext</code></li>
  <li><code>midi</code></li>
  <li><code>mpduck</code></li>
  <li><code>nats_js</code></li>
  <li><code>ortools</code></li>
  <li><code>querio_jev</code></li>
  <li><code>qvd_next</code></li>
  <li><code>redis_adbc</code></li>
  <li><code>semantic_layer</code></li>
  <li><code>tessera</code></li>
  <li><code>tick</code></li>
  <li><code>tidbfs</code></li>
  <li><code>timestral</code></li>
  <li><code>tresor</code></li>
  <li><code>units</code></li>
  <li><code>usd</code></li>
  <li><code>warc</code></li>
  <li><code>yorc</code></li>
</ul>

Another **26 names** are available in 2.0.0 and 1.5.6, but not 1.5.5. Together with the 50 above, they account for the 76 additions relative to the 1.5.5 baseline.

<details>
  <summary>Show the 26 names already available in 1.5.6</summary>

<ul data-extension-comparison="added_since_baseline_already_in_1_5_6" style="columns: 2 14rem; column-gap: 2rem; font-size: 0.875em;">
  <li><code>anofox_decide</code></li>
  <li><code>clickhouse_scanner</code></li>
  <li><code>databricks</code></li>
  <li><code>dc</code></li>
  <li><code>differential</code></li>
  <li><code>duckdb_object_storage</code></li>
  <li><code>duckfn_kuva</code></li>
  <li><code>duckfn_statrs</code></li>
  <li><code>duckpgq</code></li>
  <li><code>ducksassy</code></li>
  <li><code>erpl_odata</code></li>
  <li><code>hudi</code></li>
  <li><code>lakemon</code></li>
  <li><code>loki</code></li>
  <li><code>mentat</code></li>
  <li><code>ng_postcode</code></li>
  <li><code>oracle</code></li>
  <li><code>oxedi</code></li>
  <li><code>pgvfs</code></li>
  <li><code>razobill</code></li>
  <li><code>root</code></li>
  <li><code>sharepoint</code></li>
  <li><code>sheetreader</code></li>
  <li><code>tantivy</code></li>
  <li><code>tributary</code></li>
  <li><code>typed_ai</code></li>
</ul>

</details>

## Extension continuity remains unfinished

In [June's distribution analysis](/blog/duckdb-community-extensions-distribution/), we argued that engine releases and extension delivery needed to be coordinated. The expectation was that users could upgrade the engine and find the extensions they depend on ready for it. That remains the relevant measure of progress for the community catalog.

The 50 names found only on 2.0.0 show that the catalog is gaining capabilities. But an application depending on one of the 84 missing names still faces an upgrade blocker. Near-equal catalog totals do not make that dependency available.

The work ahead is to port, build, and publish existing extensions for the new engine, and make the remaining gaps clear by platform. Users need to know which dependencies are ready and which still need work. A newer engine and an active extension catalog do not, by themselves, establish that an application's upgrade path is complete.

## What this means for an upgrade

DuckDB 2.0.0 [shipped on October 21](https://duckdb.org/2026/10/21/announcing-duckdb-200), fifteen calendar days before this snapshot. Its catalog has had much less time to mature than 1.5's. These observations describe the upgrade choice today; they do not measure which release had better availability on launch day, or how quickly missing builds will arrive.

Start with the extensions your application actually uses. Check that each supports your exact engine version and platform, follow the maintainer's installation instructions, then run `INSTALL`, `LOAD`, and representative queries in a clean test environment. For names marked missing, check whether the maintainer has a supported 2.0 build or a replacement under another name.

If a required dependency has no suitable 2.0 build, staying on 1.5 while that is resolved is a reasonable choice. DuckDB has extended 1.5 support through March 2027. [Release calendar](https://duckdb.org/release_calendar).

**The ecosystem is advancing, but extension availability has not caught up with the engine release.** Two weeks into 2.0.0, nearly 30% of the names available for 1.5.5 still lack a build in this comparison. We have new capabilities; the predictable continuity we wanted for existing applications remains unfinished.

## Method

This November 5 snapshot covers **413 names and 6,340 artifact checks** across the three DuckDB versions and five platforms listed above, using the community and Query Farm DuckDB repositories. Core extensions, Haybarn, and other repositories are outside the comparison.

Successful artifact responses count as available; HTTP 404 counts as missing. Other failures were retried, with none unresolved. We excluded 25 known migration stubs and counted destination builds once. We did not execute the binaries.

Retention uses 1.5.5 as the baseline. Overall counts combine the five platforms; the 2.0.0-only list excludes names present in either 1.5 patch. These are currently published builds, not release-day measurements or runtime compatibility tests.
