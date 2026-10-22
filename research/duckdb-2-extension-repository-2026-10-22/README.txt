Evidence for the DuckDB 2.0 Query Farm extension repository post

Collection
  GitHub API via gh pr list, retrieved October 22, 2026.
  All 1,988 PRs merged in the twelve complete UTC months October 2025
  through September 2026. Each month is fetched separately to stay below
  GitHub's 1,000-result search cap; no month reaches that cap.
  Exact command and retrieval time: collection.json.
  Monthly raw API responses: YYYY-MM.json.

Measurement
  Elapsed hours = mergedAt - createdAt. Each PR has equal weight.
  Group by UTC merge month. Quantiles use linear interpolation
  (numpy.quantile, method="linear"). No outliers are removed.
  Includes extension updates, additions, CI, documentation and maintenance.
  Excludes open PRs and PRs closed without merging. Measures only completed
  PRs, not the outstanding backlog or a forecast for a newly opened PR.
  Includes author revisions and CI; does not isolate reviewer wait or
  measure binary publication. Weekend overlap does not establish how much
  time was attributable to maintainer availability.

Reproduce
  uv run scripts/generate-extension-repository-chart.py
  Add --fetch to refresh the raw GitHub snapshot (requires authenticated gh).
  The script asserts the merge window, uniqueness and collection count.
  Public outputs under public/media/posts/duckdb-2-query-farm-repository:
    merged-prs.csv, monthly-merge-times.csv, desktop/mobile SVG and PNG.
  Optimize the saved generated artwork and build its title/Open Graph card:
    node scripts/generate-extension-repository-images.mjs
  The built-in image_gen tool created the final artwork. Exact prompt and
  original output location: artwork-prompt.txt. The master is saved under
  design/duckdb-2-query-farm-repository/extensions-artwork.png; the site uses
  a 1440x480 WebP. The title card reads its title from post frontmatter and
  embeds the artwork and outlined fonts.

Source checks
  Earlier analysis:
    src/content/blog/duckdb-community-extensions-distribution.md
  Friday-to-Monday example (68.15 hours; includes a Monday branch merge):
    https://github.com/duckdb/community-extensions/pull/1265
  A5 stub source, read from GitHub at this immutable commit:
    https://github.com/Query-farm/a5/blob/f3e8fba2b615b6e4cface8aedc85dfdd8b943ba7/src/a5_extension.cpp
  Bitfilters stub, same behavior independently checked:
    https://github.com/Query-farm/bitfilters/blob/17ff3ae7348579cba9a70ce2f184243b1a503c56/src/bitfilters_extension.cpp
  The stubs check the repository prefix and signing-key fingerprint, and
  load an already installed build or give setup instructions. They do not
  create repositories or install extensions automatically.
  Installation SQL executed successfully using duckdb==2.0.0 from PyPI,
  with temporary repository/extension directories and default signature
  checking. A5's a5_lonlat_to_cell returned a value. See install-check.txt.
  Publishing workflow:
    https://duckdb.org/community_extensions/development#publishing
  Distinguish reviewing submissions from auditing all extension code:
    https://duckdb.org/community_extensions/faq#are-community-extensions-safe-to-install

Publication status to keep accurate
  At initial research time, the A5 community descriptor still referenced
  the full implementation. PR 3261 was open then, and a subsequent check
  confirmed it merged at 2026-10-22T21:15:59Z:
    https://github.com/duckdb/community-extensions/pull/3261
  The article therefore says stubs were created for the community repository,
  without claiming every stub has already been published there.
  Approved for publication on October 22, 2026, with draft: false.

SEO and editorial revision
  Title and description now name DuckDB 2.0 and the extension repository.
  Installation SQL appears near the top, followed by the release rationale.
  Credits DuckDB's new repository support:
    https://duckdb.org/docs/2.0/extensions/extension_repositories
  Makes the limits of the PR data explicit in the body, with the sample
  composition in the caption. Retains the weekend example without implying
  the maintainers owe Query Farm a weekend release service.
  Ends with the extension catalogue and an invitation for other authors to
  contact hello@query.farm. Treats DuckDB 2.0 as released.
