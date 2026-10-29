---
title: "RapidFuzz for DuckDB 2.0: best-match extraction and Unicode-aware scores"
description: "RapidFuzz for DuckDB 2.0 picks the best match from a list in one call, scores non-ASCII text by character, adds Levenshtein and edit alignments, and runs column-against-constant comparisons two to four times faster."
showDescription: false
pubDate: 2026-10-29
author: "Query Farm Team"
tags: ["DuckDB", "Extensions", "Fuzzy Matching", "Text"]
extensions: ["rapidfuzz"]
draft: false
heroImage: "/media/posts/rapidfuzz-for-duckdb-2/social.png"
heroImageAlt: "RapidFuzz for DuckDB 2.0: best-match extraction and Unicode-aware scores. Rows of cut-paper tiles, each a slightly different spelling, are aligned against a canonical row, scored on a dial, and matched to one of three reference cards."
leadVisual:
  src: "/media/posts/rapidfuzz-for-duckdb-2/fuzzy-artwork.webp"
  alt: ""
  width: 1440
  height: 480
---

<aside class="article-brief" aria-labelledby="article-brief-title">
  <div class="article-brief-inner">
    <p id="article-brief-title" class="article-brief-label">In brief</p>
    <ul>
      <li><code>rapidfuzz_extract_one</code> and <code>rapidfuzz_extract</code> pick the best matches from a list, with a cutoff for weak ones.</li>
      <li>Scores count Unicode characters, not UTF-8 bytes, and match Python's <code>rapidfuzz</code>.</li>
      <li>New: Levenshtein with edit costs, Damerau-Levenshtein, five ratios, and edit alignments. Comparisons against a constant run 2–4× faster.</li>
    </ul>
  </div>
</aside>

The [RapidFuzz extension](/products/extensions/rapidfuzz/) brings the [RapidFuzz](https://github.com/rapidfuzz/rapidfuzz-cpp) C++ library to DuckDB. Its DuckDB 2.0 release goes from 37 functions to 57 and changes two things existing queries will notice, covered under [Upgrading](#upgrading).

## Find the best match

`rapidfuzz_extract_one` returns the best candidate from a list, like Python's `rapidfuzz.process.extractOne`:

```sql
SELECT rapidfuzz_extract_one('cowboys',
    ['New York Jets', 'New York Giants', 'Dallas Cowboys']) AS best;
-- {'choice': Dallas Cowboys, 'score': 83.07692307692308, 'choice_index': 3}
```

`rapidfuzz_extract` returns the top `top_k` matches (default 5, `NULL` for all). Both rank by `WRatio` unless you pass another `scorer`, such as `'token_sort_ratio'` or `'jaro_winkler_normalized_similarity'`.

To match a table against a reference list, pass the list as a subquery:

```sql
CREATE TABLE suppliers(name) AS VALUES
    ('Acme Corporation'), ('Globex Corporation'), ('Initech'),
    ('Umbrella Corporation'), ('Wayne Enterprises');

CREATE TABLE invoices(vendor) AS VALUES
    ('ACME corp.'), ('Globex Corporation Inc'), ('initech'),
    ('Umbrela Corp'), ('Stark Industries');

SELECT vendor,
       rapidfuzz_extract_one(vendor, (SELECT list(name) FROM suppliers)).choice AS best_guess
FROM invoices;
```

<div class="query-result" role="region" aria-label="Result: best supplier match for each invoice vendor, without normalization or a cutoff" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>vendor</th><th>best_guess</th></tr></thead>
    <tbody>
      <tr><td>ACME corp.</td><td>Globex Corporation</td></tr>
      <tr><td>Globex Corporation Inc</td><td>Globex Corporation</td></tr>
      <tr><td>initech</td><td>Initech</td></tr>
      <tr><td>Umbrela Corp</td><td>Umbrella Corporation</td></tr>
      <tr><td>Stark Industries</td><td>Wayne Enterprises</td></tr>
    </tbody>
  </table>
</div>

Two are wrong. Matching is case-sensitive, so `ACME corp.` lost to Globex, and `Stark Industries` has no supplier but still got the closest one. Lowercase both sides, set `score_cutoff`, and use `choice_index` to recover the original spelling:

```sql
WITH choices AS (
    SELECT list(lower(name) ORDER BY name) AS keys,
           list(name ORDER BY name) AS names
    FROM suppliers
)
SELECT vendor,
       names[m.choice_index] AS supplier,
       round(m.score, 1) AS score
FROM (
    SELECT vendor, names,
           rapidfuzz_extract_one(lower(vendor), keys, score_cutoff := 80) AS m
    FROM invoices, choices
);
```

<div class="query-result" role="region" aria-label="Result: supplier matches after lowercasing, with a score cutoff of 80" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>vendor</th><th>supplier</th><th>score</th></tr></thead>
    <tbody>
      <tr><td>ACME corp.</td><td>Acme Corporation</td><td>85.5</td></tr>
      <tr><td>Globex Corporation Inc</td><td>Globex Corporation</td><td>95.0</td></tr>
      <tr><td>initech</td><td>Initech</td><td>100.0</td></tr>
      <tr><td>Umbrela Corp</td><td>Umbrella Corporation</td><td>82.5</td></tr>
      <tr><td>Stark Industries</td><td>NULL</td><td>NULL</td></tr>
    </tbody>
  </table>
</div>

NULL choices are skipped but keep their position, so `choice_index` stays correct. Ties keep list order.

## Count characters, not bytes

Previous releases scored UTF-8 bytes, so `é` counted as two characters and `日本語` as nine. Non-ASCII strings are now decoded to code points first; ASCII strings are unaffected.

```sql
SELECT rapidfuzz_indel_distance('café', 'cafe') AS indel,
       rapidfuzz_osa_distance('café', 'cafe') AS osa,
       rapidfuzz_hamming_distance('日本語', '日本人') AS hamming,
       rapidfuzz_ratio('naïve café', 'naive cafe') AS ratio;
```

| Release | `indel` | `osa` | `hamming` | `ratio` |
|---|---|---|---|---|
| DuckDB 1.5 | 3 | 2 | 3 | 72.7 |
| DuckDB 2.0 | 2 | 1 | 1 | 80.0 |

The new values match Python's `rapidfuzz`, so thresholds tuned in a notebook carry over.

## Options

Every scorer takes `score_cutoff`. Besides filtering, it lets RapidFuzz stop early on pairs that can't qualify. Distances above the cutoff return `cutoff + 1`; similarities below it return `0`:

```sql
SELECT vendor FROM invoices
WHERE rapidfuzz_levenshtein_distance(lower(vendor), 'initech', score_cutoff := 2) <= 2;
```

Options are keyword-only and must be constants:

| Option | Functions | Default |
|---|---|---|
| `score_cutoff` | every scorer, `rapidfuzz_extract`, `rapidfuzz_extract_one` | no cutoff |
| `scorer`, `top_k` | `rapidfuzz_extract` (`scorer` also on `rapidfuzz_extract_one`) | `'wratio'`, `5` |
| `insert_cost`, `delete_cost`, `replace_cost` | `rapidfuzz_levenshtein_*` | `1` |
| `pad` | `rapidfuzz_hamming_*` | `true` |
| `prefix_weight` | `rapidfuzz_jaro_winkler_*` | `0.1`, at most `0.25` |

With `replace_cost := 2`, `kitten` is 5 from `sitting` instead of 3. With unequal insert and delete costs, argument order matters.

## See where strings differ

`rapidfuzz_levenshtein_opcodes` returns the edits as ranges:

```sql
SELECT op.operation,
       substr('kitten', op.s1_start + 1, op.s1_end - op.s1_start) AS from_text,
       substr('sitting', op.s2_start + 1, op.s2_end - op.s2_start) AS to_text
FROM (SELECT unnest(rapidfuzz_levenshtein_opcodes('kitten', 'sitting')) AS op);
```

<div class="query-result" role="region" aria-label="Result: the edit operations that turn kitten into sitting" tabindex="0">
  <div class="query-result__label">result</div>
  <table>
    <thead><tr><th>operation</th><th>from_text</th><th>to_text</th></tr></thead>
    <tbody>
      <tr><td>replace</td><td>k</td><td>s</td></tr>
      <tr><td>equal</td><td>itt</td><td>itt</td></tr>
      <tr><td>replace</td><td>e</td><td>i</td></tr>
      <tr><td>equal</td><td>n</td><td>n</td></tr>
      <tr><td>insert</td><td></td><td>g</td></tr>
    </tbody>
  </table>
</div>

`rapidfuzz_levenshtein_editops` lists one entry per edit, and Indel versions of both exist. Positions are 0-based character offsets, as in Python.

`rapidfuzz_partial_ratio_alignment` finds where a short string best fits in a longer one:

```sql
SELECT substr(note, a.s1_start + 1, a.s1_end - a.s1_start) AS matched,
       round(a.score, 1) AS score
FROM (
    SELECT 'Order #4471: shipped via Federal Expres' AS note,
           rapidfuzz_partial_ratio_alignment(note, 'Federal Express') AS a
);
-- Federal Expres, 96.6
```

## New metrics

- **Levenshtein**, with the edit costs above. Earlier releases didn't have it.
- **Damerau-Levenshtein**, which counts an adjacent swap as one edit: `recieve` is 1 from `receive`, not 2.
- **Ratios:** `rapidfuzz_wratio`, `rapidfuzz_qratio`, `rapidfuzz_token_ratio`, `rapidfuzz_partial_token_ratio`, `rapidfuzz_partial_token_sort_ratio`.

Every function now has a description and example in `duckdb_functions()`.

## Faster against a constant

When one argument is constant, the extension now uses RapidFuzz's cached scorers, which preprocess that string once instead of per row. Strings are also no longer copied before scoring.

`sum(f(s, 'customer 424242 smith jones'))` over 5 million strings, one thread on an Apple M3, best of three:

| Function | 1.5 release | 2.0 release | Speedup |
|---|---|---|---|
| `rapidfuzz_ratio` | 0.50 s | 0.15 s | 3.3× |
| `rapidfuzz_indel_distance` | 0.50 s | 0.12 s | 4.1× |
| `rapidfuzz_lcs_seq_normalized_similarity` | 0.49 s | 0.15 s | 3.3× |
| `rapidfuzz_jaro_winkler_similarity` | 0.68 s | 0.34 s | 2.0× |
| `rapidfuzz_token_sort_ratio` | 2.23 s | 0.96 s | 2.3× |

DuckDB's built-in `levenshtein` and `jaccard` ran within 5% on both DuckDB versions, so the gain is the extension's. On the same data, `rapidfuzz_levenshtein_distance` took 0.42 s against 4.3 s for the built-in `levenshtein`, with identical results.

## Upgrading

- **Non-ASCII scores change.** Expect lower distances and higher similarities for accented, non-Latin or emoji text. Recheck thresholds tuned on old values.
- **Integer metrics return `BIGINT`.** `_distance` and `_similarity` for Levenshtein, Damerau-Levenshtein, OSA, Indel, LCSseq, Hamming, Prefix and Postfix were `DOUBLE`. Normalized scores, Jaro, Jaro-Winkler and ratios are still `DOUBLE`.

rapidfuzz-cpp is pinned to 3.3.4, which fixes `WRatio` when one string is exactly eight times longer than the other and an out-of-bounds read in edit-operation handling. See the [changelog](https://github.com/Query-farm/rapidfuzz/blob/v2.0/CHANGELOG.md) for everything else.

## Try it

Install from the [Query Farm extension repository](/blog/duckdb-2-query-farm-repository/):

```sql
SET allow_extension_repositories = 'allowed';

CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
    WITH PREFIX 'https://duckdb-extensions.query.farm';

INSTALL rapidfuzz FROM query_farm;
LOAD rapidfuzz FROM query_farm;
```

Already installed? Use `FORCE INSTALL rapidfuzz FROM query_farm` in a fresh session. If a score differs from Python's `rapidfuzz` for the same strings, [open an issue](https://github.com/Query-farm/rapidfuzz/issues).
