# DuckDB statement lifecycle patch

Base: `d54cbbe3df17e8e5ce68312f483b4155836112aa` (DuckDB's `v2.0-cyanoptera` branch).

All eight patches apply unchanged from the preceding `94abd4ed366` base.
Upstream now resolves `txid_current()` through the session's metatransaction,
so it also works when an attached semantic catalog is the default. Crossfield's
`attach_only.test` checks this and prepared transaction identity across a catalog
switch and commit. [Current qualification](../../docs/BUSINESS_ADOPTION_PROGRESS.md#validation)
records the matching artifacts and test results.

The upstream refresh preserves all seven extension capabilities. Lifecycle
dispatch follows the new per-statement expansion path, including direct
prepare and bind-only APIs, before PRAGMA callbacks run. Submission retains
upstream result-retention and verification behavior; parser callbacks receive
the upstream context-aware options. Earlier validation checkpoints below refer
to their original engine revision.

Apply all eight patches in `series` order to that exact source with `git apply`.
The first seven provide extension capabilities; the eighth fixes SQL presentation.
`0001-statement-lifecycle.patch` adds the generic `duckdb/main/statement_lifecycle_extension.hpp` interface and capability macro `DUCKDB_STATEMENT_LIFECYCLE_VERSION=2`. It contains no Crossfield model, metric or policy definitions.

`0008-sql-formatter-parameters.patch` keeps `$name` and `$1` together during native
SQL formatting, including names classified as keywords. The unpatched formatter
rendered `$customer` as `$ customer`, failing the existing Crossfield export
contract. `[sql_formatter_parameters]` checks spelling under all keyword-case
settings, quoted literal preservation and numerical prepared execution. This
changes presentation only and adds no extension hook or ABI change.

`StatementLifecycleExtension::GetVersion()` exports the host's runtime capability. Crossfield requires it to equal the version used to compile the extension before registration. Crossfield loadable artifacts must use `EXTENSION_STATIC_BUILD=OFF`, with the host symbols globally available; otherwise a second DuckDB copy inside the module could answer the probe itself. The pinned source SHA alone does not identify patched native ABI compatibility.

Callbacks run in registration order using an immutable registry snapshot. Dispatch covers preprocessing, submission before CONNECT routing, and planning. Rewriters run before parsed-statement optimization. All validators then see the final rewritten statement. Post-bind callbacks receive private state from the same planning invocation. Callback failures retain their original error type and details, are tagged terminal, and bypass operator fallback, planning-error retries and verification fallback.

The `before_cast` callback runs before contextual explicit or implicit cast binding can consult a registered provider. A connection-owned RAII stack exposes the current private planning invocation during both planning and optimization; nested planners restore their parent and exceptions unwind the stack. Recursive contextual binding from inside a cast-policy callback fails terminal rather than bypassing validation. The callback can use `CanOverrideDefaultCast` to inspect registrations without invoking them. Default-only cast sets do not consult providers and bypass this callback.

Upstream expands PRAGMA and multi-statements at submission, preparation and
bind-only inspection. Dispatch precedes expansion callbacks, every child's
verification, and each child's submission before parameter/retry handling.
This preserves checks after an earlier child changes connection policy.
`[statement_lifecycle_expansion]` covers PRAGMA sentinels, deferred metadata,
child-local state, verification/retry copy sentinels, rollback and recovery,
and a prepared expansion created before policy registration.

SQL and API prepared statements retain the original unbound statement through DuckDB’s existing `PrepareSQLStatement` path. The execution callback runs before EXECUTE argument binding or evaluation, including on handles created before extension registration. It can force recompilation from the retained original. If a lifecycle-forced rebind changes an already resolved result schema, execution requires reprepare. An initially unresolved parameterized result acquires its schema during binding; it cannot be compared with a schema that did not yet exist.

Each extension must inspect PREPARE wrappers without prematurely rewriting the child: the child’s separate planning invocation performs the rewrite after preserving its intent. Relation constructors bind before a shared relation statement exists, so the separate `relation_bind` callback allows an extension to reject this entry point. Direct table-name inspection is identified by `INSPECTION`; an extension must reject it when its ordinary preparation policy cannot be applied. Opaque logical plans expose a null original AST and can likewise be rejected. Dispatch callbacks are idempotent because a statement may pass more than one entry boundary.

`0002-refresh-parser-options-between-statements.patch` refreshes the lazy batch parser after each executed statement, so a grammar setting changed by a preceding statement takes effect immediately. Tokenization remains shared and compiled grammars retain the existing connection cache. Its regression activates and deactivates extension syntax within SQL batches.

`0003-function-binding-authorization.patch` upgrades the lifecycle interface to
version 3 and adds `before_scalar_bind`. The binder calls it after overload
selection, before NULL folding, `resolve_types`, argument casts, `bind` and
`bind_expression`, including the earlier lambda-parameter binding path. Direct
function-binding APIs use the same hook. Scalar authorization ends after post-bind
validation; optimizer-generated implementation helpers belong to the trusted
engine. Contextual cast authorization remains active during optimization. Invocation
state is scoped to the connection/planner; recursive binding within authorization
fails terminal. Callbacks must be idempotent, since a definition can be checked
more than once. Catalog inspection inside authorization must not bind functions.

`BoundScalarFunction::GetDefinition()` already retains the selected catalog
overload across specialization. For casts, comparisons and BETWEEN constructed
directly by the engine, this patch adds operator provenance to `ScalarFunction`.
The extension can validate the definition, types, arguments and final plan without
comparing executable addresses. Native providers and engine callbacks remain
trusted code; this is SQL governance, not protection against hostile native
memory modification. The old callback-pointer comparison and host setter are
removed. Native consumers must rebuild against the new layout.

`0004-extension-parser-options.patch` adds `ExtensionCallback::OnParserOptions` after the connection's parser options have been collected, with capability macro `DUCKDB_EXTENSION_PARSER_OPTIONS_VERSION=1` and exported `ExtensionCallback::GetParserOptionsVersion()`. Callbacks run in registry snapshot order for every context-aware parser construction, including connections created before an extension was loaded. They modify that invocation's options without changing connection settings. The hook neither enables parser override nor changes CONNECT routing. Callback implementations must not recursively call `GetParserOptions`.

While a Crossfield catalog is attached, Crossfield uses this hook to compose its registered grammar with the caller's active grammar extensions and caches the result per connection. CONNECT, explicit dialects and grammars supplied by an earlier callback retain their selected parser. Grammar availability does not grant semantic query authority: lifecycle validation still rejects default-model semantic queries in mode off. This patch extends the native `ExtensionCallback` vtable, so all native extension callback implementations must be rebuilt against the matching engine. Crossfield checks the runtime parser-options capability before accessing loader state, and its loadable must leave that probe unresolved to the host.

The no-extension preparation path does not copy the AST or allocate lifecycle state. The patch is query governance plumbing, not a process sandbox: native code and trusted extensions remain privileged. Patched and unpatched native artifacts are not interchangeable even when they report the same base DuckDB SHA; distribute the engine and extension together with the exact patch hashes recorded by the build manifest. Crossfield rejects builds against a partial lifecycle header below version 3.

`0005-table-in-out-keyword-arguments.patch` separates named scalar options from
the row input of a correlated table in-out function. Previously
`FROM repos r, provider.pulls(r.repo, max_rows => 0)` treated `max_rows` as another
input column and failed overload resolution. Named options now participate in
signature selection, receive native casts and defaults, and remain bind-time
constants. The `[in_out_keywords]` native regression checks explicit/default/NULL
options, prepared parameters, invalid options and both optimizer modes. This is
generic table-function binding; Crossfield keeps its own approval checks.

`0006-cast-registration-provenance.patch` adds read-only
`CastFunctionSet::GetRegisteredCastExtension(source, target)` and the compile
capability `DUCKDB_CAST_REGISTRATION_PROVENANCE_VERSION=1`. It returns the
canonical extension name of the effective direct map registration without
binding or executing it. Direct application registrations remain unowned;
`ExtensionLoader` supplies canonical identity, independent of catalog aliases.
Existing first-registration-wins behavior is unchanged. ICU's naive/timezone
cast helpers now register through the loader, as its string/date helpers already
do. Crossfield uses this evidence for a finite set of approved temporal casts;
policy stays in the extension. No public object layout or virtual interface
changes; the new exported method must resolve against the matching host.

`0007-parser-error-guidance.patch` adds the opt-in `ParserErrorExtension`
subclass through the existing callback registry. Its `OnParserError` callback
receives the original query and parser diagnostic before text-location rendering
or JSON conversion. It can add structured metadata and append repair guidance;
the engine preserves the original error category, diagnostic prefix and location.
A failed or replacing annotation is ignored. A private diagnostic marker prevents
duplicate annotation when eager parsing rethrows through another API boundary.
The existing `ExtensionCallback` vtable and `ParserOptions` layout are unchanged;
the new exported destructor supplies the native RTTI anchor. The generic
`[parser_error_extension]` tests cover Query, Submit, Prepare, ExtractStatements,
text/JSON errors, legacy callbacks, non-parser errors and annotation failure.
Crossfield target recognition and signature guidance remain in the extension.

## Validation

The seventh patch passes **2 parser-diagnostic cases / 94 assertions** on EC2
([native hook](../../logs/dev/20261015T172953Z-77394-core-test.log)). The affected
**22 lifecycle and table-function qualification cases / 5,581 assertions** also
pass ([compatibility](../../logs/dev/20261015T173135Z-79247-core-test.log)).
The [parser-guidance baseline](../../logs/dev/20261015T172033Z-75121-test.log)
records both optimizer modes rejecting a malformed semantic call at the correct
`)` location while omitting its discoverable calling signatures.

The earlier six-patch series passed **19 lifecycle cases / 5,237 assertions**, **3 ICU
cast cases / 87 assertions** and Crossfield's **214/214 required CTest cases**
on EC2 Linux ARM64. [Latest evidence](../../logs/timestamp-dates/ctest.log). Provider tests
accept both registered and bind-specialized closures with independent numerical
expectations; changed definitions and provider revisions reject.
See [core assertions](../../logs/timestamp-dates/core-lifecycle.log) and
[ICU cast results](../../logs/timestamp-dates/icu/run.log).

The paragraphs below retain patch-development checkpoints, including failures
and work still pending at those historical points. They are not a current work
list. [Implementation status](../../docs/BUSINESS_ADOPTION_PROGRESS.md) links the
recorded engine/provider results; [TASKS.md](../../TASKS.md) owns active work.

The new `[statement_lifecycle]` C++ group covers early bind and PRAGMA sentinels, SQL/API prepare and execute, pending submission, plan extraction, bind-only APIs, relation inspection, raw routing on an existing CONNECT, per-statement batch settings, independent connections, original-intent recompilation, result-schema changes, deterministic rewrites and terminal policy errors. These callbacks cannot be registered from SQL, so the regression harness is C++.

At patch export, local syntax checks passed for the modified translation units and the regression file, `make format-fix` and `make generate-files` passed, and `git diff --check` passed. The coordinated EC2 build passed all 14 lifecycle and parser-setting cases with 5,164 assertions, including the runtime-version assertion, zero cast-provider bind/execution callbacks, SQL/API prepared paths, independent connections, exception recovery, nested state restoration and recursion rejection.

The retired third patch compared raw callback addresses and required a host
setter on macOS. Its historical results do not qualify the replacement. Current
coverage checks early rejection with zero resolution/bind/execution callbacks,
NULL shortcuts, nested SQL, old prepared handles, independent connections,
exception recovery, recursion rejection and valid capturing-closure specialization.
`engine-inputs.json` records the pinned base and ordered patch series.

The first broad run reported 7,813 passed, 15 failed batches and 204 skipped tests. Missing loadable test artifacts explained several failing batches. A matched focused comparison of the seven remaining cases passed the same four and failed the same three on both patched and unmodified engines; the shared failures concern external-file-cache memory, batch-load memory and an insertion-order block-count expectation. This establishes no new regression among those seven, not a complete core-suite pass. A full run with all configured artifacts remains required.

The `[parser_options]` cases (also in `[statement_lifecycle]`) cover pre-existing and later connections, parser-option composition, unchanged settings, ordinary context parser construction and callback registration order. The Crossfield catalog API fixture records the motivating failure: an existing mode-off reader cannot parse explicit attached semantic syntax before this hook. These cases and the native fixture pass in the final [149/149 EC2 regression](../../logs/catalog-integration/catalog-regression.log); the [pre-patch failure](../../logs/catalog-integration/catalog-grammar-baseline.log) preserves the reason for the hook.

Run after building the patched engine:

```sh
build/reldebug/test/unittest '[statement_lifecycle]'
build/reldebug/test/run --workers=50% '*'
```

The second command uses the same parallel runner as `make allunit`, pointed at the existing build. `make allunit` otherwise targets `build/release` and normally rebuilds it. Build all configured test extension artifacts before the full run.

`P2` adds no persistent extension metadata in this version: the existing original AST plus mandatory execute-time recompilation supplies the required initial behavior. An extension can add cache validation metadata later without weakening these checks.
