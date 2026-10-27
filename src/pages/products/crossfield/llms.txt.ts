import { crossfieldPages, crossfieldStories } from '../../../data/crossfield';

export const GET = () => new Response(`# Crossfield

> Crossfield is Query.Farm's native semantic layer for DuckDB: query business definitions, compose approved models, and compare model revisions through SQL.

## Availability

Crossfield will ship as part of an upcoming Haybarn release, Query Farm's DuckDB distribution, with its matching DuckDB engine support and extension. These pages currently describe development software, 0.1.0-dev, using qualified development builds. The announced distribution plan does not mean existing Haybarn packages already include Crossfield. There is no stock DuckDB INSTALL recipe.

Validated DuckDB 2.0 release base: d54cbbe3df17e8e5ce68312f483b4155836112aa, with Crossfield's eight engine patches. Fresh offline fixture checks and earlier captured/integration evidence are separated at https://query.farm/crossfield/examples/verification.txt. No blanket current-provider qualification is implied.

## Product guides

${crossfieldStories.map(page => `- [${page.title}](https://query.farm${page.href}): ${page.description}`).join('\n')}

## Documentation

${crossfieldPages.map(page => `- [${page.title}](https://query.farm${page.href}): ${page.description}`).join('\n')}

## Interpretation

- Examples lead with FROM SEMANTIC catalog.model. The equivalent catalog spelling FROM catalog.semantic.model is also supported and enforces the same rules.
- Discover attached model identities, approved members, compatible dimensions and callable signatures before constructing a query.
- Attached semantic entries validate their contracts in every mode. Strict mode additionally governs ordinary statements on the connection.
- Direct cross-model joins require model permission and compatible declared shared dimensions covering the complete grouping keys. Matching names alone are insufficient. Cross-model business queries use semantic/off mode; strict mode requires one attachment.
- Model revisions preserve definition bytes, not source-data snapshots. Comparing two revisions can read the same current rows; ordinary outer arithmetic remains author-controlled reconciliation.
- An unsealed connection can change modes. A host must separately control authentication, source access and session sealing.
- EXPLAIN (SEMANTIC) does not execute providers. EXPLAIN (SQL) binds and optimizes; EXPLAIN ANALYZE executes.
- Preserve business meaning when repairing rejected SQL. Jaffle v2 revenue excludes tax; order_total includes it.
- Documentation examples require their stated models, source tables and setup. Precomputed results are independent fixture expectations, not live API responses.
- Apache Ossie (incubating) supplies open model/expression definitions; Crossfield implements a pinned profile plus explicit extensions. FROM SEMANTIC is Crossfield SQL, not an Ossie standardized query language.
- Native model validation does not check numerical answers. There is no published validator release; CI examples require a qualified local bundle.
- Measurement support is per field. Whole-interval assignment rejects overlap and partial periods; unknown support is not inferred from cadence.
- The recorded Open-Meteo worker check failed on native VGI 2.1.0 versus worker 2.2.0. Offline measurement examples remain separate evidence; newer combinations need their own qualification.
- VGI is an optional, separately provisioned source path with build- and provider-specific limits.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
