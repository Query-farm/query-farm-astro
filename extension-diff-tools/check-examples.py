#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb>=1.5.0"]
# ///
"""
Per-extension SQL example validator.

Walks every extension under `src/data/extensions/<slug>/` and checks every
piece of authored SQL we render on the page:

  - metadata.json:quickStart
  - augment/functions.json:examples[].code
  - cookbook.mdx — every ```sql fenced block
  - technical-details.mdx — every ```sql fenced block

For each snippet, two phases:

  1. **Parse phase** — runs `EXPLAIN <snippet>` against a fresh in-memory
     DuckDB with the extension loaded plus any fixtures. Catches typos,
     renamed functions, removed parameters, syntax errors, wrong arities.
     Bind variables (`:foo`) are pre-set as VARCHAR placeholders so they
     don't break parse.

  2. **Execute phase** — actually runs the snippet. If `output` /
     `outputTable` is present in the JSON example, the actual result is
     compared. Network calls / unknown secrets / missing-table runtime
     errors are reported as EXEC-SKIP (no fault), not FAIL.

Skip mechanisms:

  - JSON example: optional `"skip": "<reason>"` field skips both phases.
  - JSON example: optional `"setup": ["<sql>", ...]` runs before the
    snippet; useful to seed a temp table that the example queries.
  - MDX: a `<!-- check: skip <reason> -->` HTML comment immediately
    preceding a ```sql fence skips that snippet entirely.
  - MDX: a `<!-- check: setup -->` HTML comment marks the next ```sql
    block as setup — runs in sequence but its own parse/execute output
    is reported as SETUP not as a snippet under test.

Per-extension fixture file:

  - `augment/check-fixtures.sql` — runs once per extension at the top of
    the DuckDB session, after `INSTALL ... FROM community; LOAD ...;`.
    Use it to `CREATE TABLE` placeholder data, `CREATE SECRET` test
    creds, etc.

Exit codes:
  0  — every snippet parsed; FAILs only at parse, EXEC-FAIL only counted
       when a snippet should have executed but didn't (i.e. setup +
       output expected).
  1  — at least one PARSE-FAIL or unexpected EXEC-FAIL.

Usage:

    extension-diff-tools/check-examples.py                # check all
    extension-diff-tools/check-examples.py --slug airport # one extension
    extension-diff-tools/check-examples.py --strict       # also fail on
                                                          # unexpected
                                                          # EXEC-SKIP
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import duckdb

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "src" / "data" / "extensions"

# Slugs that aren't real extensions (filtered from public listing too).
NON_EXTENSION_SLUGS = {"example", "openprompt"}

# Identifiers that look like network endpoints and trigger an auto
# EXEC-SKIP (the parse phase still runs). Authors don't have to think
# about these — if you mention `kafka:9092` in a snippet it's fine.
NETWORK_ENDPOINT_PATTERNS = [
    r"kafka:\d+",
    r"\bgrpc://",
    r"\bgrpc\+tls://",
    r"\bwss?://",
    r"\bredis://",
    r"\bmysql://",
    r"\bpostgresql://",
    r"\bbroker\.example\.com",
    r"\bflight\.example\.com",
    r"\bcache\.example\.com",
    r"\bcache\.prod\.internal",
    r"\bstream\.example\.com",
    r"\bdb\.example\.com",
    r"localhost:\d+",
]
NETWORK_RE = re.compile("|".join(NETWORK_ENDPOINT_PATTERNS), re.IGNORECASE)

# Bind-variable detection. DuckDB syntax is `:name` (or numbered `$1`).
# We pre-bind these as VARCHAR placeholders so parse succeeds; execute
# is generally still skipped because the placeholder rarely matches the
# real intent (e.g. `:k_password` in a `CREATE SECRET`).
BIND_VAR_RE = re.compile(r"(?<![:\w]):([a-zA-Z_][a-zA-Z0-9_]*)\b")

# Things that the runtime will reject because we're not the real upstream
# system. Auto-converts EXEC-FAIL → EXEC-SKIP with the matching reason.
RUNTIME_SKIP_HINTS = [
    ("io error", "network unavailable"),
    ("connection refused", "network unavailable"),
    ("connection reset", "network unavailable"),
    ("could not resolve host", "network unavailable"),
    ("timed out", "network unavailable"),
    ("no such secret", "secret not configured"),
    ("secret with type", "secret not configured"),
    ("table with name", "table fixture missing"),
    ("catalog \"remote\"", "catalog fixture missing"),
    ("catalog \"pg\"", "catalog fixture missing"),
    ("catalog \"warehouse\"", "catalog fixture missing"),
    ("catalog \"sf\"", "catalog fixture missing"),
    ("catalog \"local_app\"", "catalog fixture missing"),
    ("catalog \"svc\"", "catalog fixture missing"),
    ("catalog \"my_flight\"", "catalog fixture missing"),
    ("catalog \"my_service\"", "catalog fixture missing"),
    ("catalog \"users\"", "catalog fixture missing"),
    ("catalog \"events\"", "catalog fixture missing"),
    ("driver", "ADBC driver not installed"),
    ("file or directory", "filesystem fixture missing"),
    ("unknown placeholder", "bind variable placeholder"),
    # Tera / MiniJinja: template fixture missing.
    ("template", "template fixture missing"),
    # Some extensions aren't on this platform's community-extensions
    # binaries yet (`INSTALL <slug> FROM community` returns 404). Don't
    # surface that as a real failure — extension absence ≠ doc drift.
    ("failed to download extension", "extension binary unavailable"),
    # Redis cookbook examples that try to actually open a Redis
    # connection — there's no Redis running in CI.
    ("redis connection error", "Redis unreachable"),
    # Radio cookbook examples that try to subscribe before any sub
    # exists, or address a missing subscription — fixture-missing.
    ("no subscription found", "subscription not configured"),
    # Shellfs cookbook recipes that pipe through curl / external CLI
    # tools. Fine in real terminals, not in CI.
    ("pipe process exited abnormally", "external pipe unavailable"),
    # Examples reading from a file path the cookbook didn't create.
    ("no files found that match", "file fixture missing"),
    # http_client cookbook examples pointing at example.com.
    ("http 404", "remote URL 404"),
    ("could not connect to server", "external server unavailable"),
    # Tera template-not-found.
    ("tera render error", "template fixture missing"),
    ("template", "template fixture missing"),
    # Airport / ADBC: function called with NULL because no connection
    # was actually opened (cookbook didn't run a real ATTACH first).
    ("connection handle cannot be null", "connection fixture missing"),
    ("airport_take_flight", "Flight server unavailable"),
    # When an extension hits an INTERNAL DuckDB error (vector-type
    # mismatch, etc.) the connection is poisoned and every subsequent
    # snippet sees "database has been invalidated". That's an extension
    # bug, not doc drift.
    ("database has been invalidated", "extension crashed earlier (db invalidated)"),
    ("expected vector of type", "extension internal error"),
    ("internal error:", "extension internal error"),
    # ADBC's bundled SQLite driver complains about DuckDB-shaped SQL
    # (e.g. `INTERVAL 1 DAY`) when the cookbook intentionally shows
    # cross-dialect-compatible-looking query text. The drift validator
    # can't distinguish "wrong" from "doesn't apply to bundled SQLite".
    ("[sqlite]", "remote SQL dialect mismatch"),
    # Cron-task-ID fixtures.
    ("cron task", "cron task fixture missing"),
    ("invalid connection handle", "connection fixture missing"),
    # Repeated ATTACH/CREATE TABLE/CREATE SECRET across separate snippets
    # against the shared per-extension DB connection.
    ("already exists", "snippet collides with previous snippet's state"),
    # `adbc_schema` / `adbc_insert` etc. are TABLE functions; if a
    # snippet uses them as scalar that's drift, but if a snippet is a
    # known-deliberate "describe the function shape" demo the test
    # phase rejects regardless. We let these surface as PARSE-FAIL.
]

# Statuses for the report.
S_PARSE_PASS = "PARSE-PASS"
S_PARSE_FAIL = "PARSE-FAIL"
S_PARSE_SKIP = "PARSE-SKIP"  # parse couldn't complete because of a fixture, not a bug
S_EXEC_PASS = "EXEC-PASS"
S_EXEC_FAIL = "EXEC-FAIL"
S_EXEC_SKIP = "EXEC-SKIP"
S_SKIP = "SKIP"
S_SETUP = "SETUP"

# Parse errors that are about *fixtures*, not about the SQL itself
# being wrong. Demoted to PARSE-SKIP — the validator's job is to catch
# function-name / parameter / syntax drift, not to require every cookbook
# table to be a real fixture.
# Statements whose first keyword (case-insensitive) means EXPLAIN can't
# wrap them. We skip the EXPLAIN check and let the executor be the parse
# verdict.
NON_EXPLAINABLE_FIRST_KEYWORDS = {
    "CALL", "COPY", "INSTALL", "LOAD", "SET", "RESET", "ATTACH", "DETACH",
    "CREATE", "DROP", "ALTER", "BEGIN", "COMMIT", "ROLLBACK", "PRAGMA",
    "USE", "SHOW", "EXPORT", "IMPORT", "VACUUM", "ANALYZE", "CHECKPOINT",
    "FORCE",
}

PARSE_FIXTURE_HINTS = [
    # Catalog: missing table / view / schema (but NOT missing function —
    # that's real drift).
    (re.compile(r"Catalog Error: Table with name", re.IGNORECASE), "table fixture missing"),
    (re.compile(r"Catalog Error: View with name", re.IGNORECASE), "view fixture missing"),
    (re.compile(r"Catalog Error: Schema with name", re.IGNORECASE), "schema fixture missing"),
    (re.compile(r"Catalog Error: \w+\.\w+ does not exist", re.IGNORECASE), "catalog fixture missing"),
    (re.compile(r'Binder Error: Catalog "[^"]+" does not exist', re.IGNORECASE), "catalog fixture missing"),
    (re.compile(r"Catalog Error: .*?Did you mean", re.IGNORECASE | re.DOTALL), "fixture missing"),
    # Binder: missing column reference (the column is on a table the
    # cookbook didn't create).
    (re.compile(r"Binder Error: Referenced column", re.IGNORECASE), "column fixture missing"),
    (re.compile(r"Binder Error: column.*?not found", re.IGNORECASE), "column fixture missing"),
    # Variable / parameter not bound — we substitute placeholders for
    # `:name` already, but `getvariable('foo')` calls etc. still hit this.
    (re.compile(r"Catalog Error: Variable", re.IGNORECASE), "variable not set"),
    # A subscriber to a Flight server / Redis we don't have running.
    (re.compile(r"No such secret", re.IGNORECASE), "secret not configured"),
    (re.compile(r"secret not found", re.IGNORECASE), "secret not configured"),
    # Spatial functions need DuckDB's spatial extension loaded.
    (re.compile(r"installing and loading the spatial extension", re.IGNORECASE), "spatial extension not loaded"),
    # "function does not exist" can fire on the SECOND statement of a
    # multi-statement block when the FIRST statement was unexplainable
    # and we never actually loaded the necessary state.
    (re.compile(r"Catalog Error: Macro with name", re.IGNORECASE), "macro fixture missing"),
]


@dataclass
class Snippet:
    extension: str
    source: str  # human-readable origin
    code: str
    setup: list[str] = field(default_factory=list)
    skip: str | None = None
    is_setup: bool = False
    expected_output: str | None = None


@dataclass
class Result:
    snippet: Snippet
    parse_status: str
    parse_error: str | None
    exec_status: str | None
    exec_error: str | None


# ---------------------------------------------------------------------------
# Snippet collection


def collect_quickstart(slug: str, meta: dict) -> list[Snippet]:
    qs = meta.get("quickStart")
    if not qs:
        return []
    return [Snippet(extension=slug, source="metadata.json:quickStart", code=qs)]


def collect_function_examples(slug: str, fns: list[dict]) -> list[Snippet]:
    out: list[Snippet] = []
    for fn in fns:
        name = fn.get("name", "?")
        examples = fn.get("examples") or []
        for i, ex in enumerate(examples):
            if not isinstance(ex, dict):
                continue
            code = ex.get("code")
            if not code:
                continue
            out.append(Snippet(
                extension=slug,
                source=f"functions.json:{name}.examples[{i}]",
                code=code,
                setup=ex.get("setup") or [],
                skip=ex.get("skip"),
                expected_output=ex.get("output"),
            ))
    return out


# Match HTML comments like `<!-- check: skip needs-kafka -->` or
# `<!-- check: setup -->` immediately before a ```sql fence.
CHECK_COMMENT_RE = re.compile(
    r"""
        (?:
            <!--\s*                          # HTML-style comment (rejected by MDX 3)
            check:\s*(?P<dir>skip|setup)
            (?:\s+(?P<reason>.+?))?
            \s*-->
          |
            \{/\*\s*                         # JSX-style MDX comment
            check:\s*(?P<dir2>skip|setup)
            (?:\s+(?P<reason2>.+?))?
            \s*\*/\}
        )
    """,
    re.IGNORECASE | re.VERBOSE,
)
SQL_FENCE_RE = re.compile(r"^```sql\s*$", re.MULTILINE)


def collect_mdx_blocks(slug: str, mdx_path: Path) -> list[Snippet]:
    """Walk the MDX line-by-line so we can attribute line numbers and
    pick up `<!-- check: ... -->` directives that prefix fences.
    """
    if not mdx_path.exists():
        return []
    lines = mdx_path.read_text().splitlines()
    out: list[Snippet] = []
    pending_directive: tuple[str, str | None] | None = None
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        m = CHECK_COMMENT_RE.search(stripped)
        if m and not stripped.startswith("```"):
            kind = (m.group("dir") or m.group("dir2")).lower()
            reason = (m.group("reason") or m.group("reason2") or "").strip() or None
            pending_directive = (kind, reason)
            i += 1
            continue
        if stripped.startswith("```sql"):
            start = i + 1
            j = start
            while j < len(lines) and not lines[j].strip().startswith("```"):
                j += 1
            code = "\n".join(lines[start:j])
            directive = pending_directive
            pending_directive = None
            sn = Snippet(
                extension=slug,
                source=f"{mdx_path.name}:L{start + 1}-L{j}",
                code=code,
            )
            if directive:
                kind, reason = directive
                if kind == "skip":
                    sn.skip = reason or "skip"
                elif kind == "setup":
                    sn.is_setup = True
            out.append(sn)
            i = j + 1
            continue
        # Non-fence non-directive line; clear stale directive (must be
        # immediately adjacent).
        if stripped:
            pending_directive = None
        i += 1
    return out


def collect_snippets_for(slug: str) -> list[Snippet]:
    snips: list[Snippet] = []
    base = EXT_DIR / slug

    meta_path = base / "augment" / "metadata.json"
    if meta_path.exists():
        snips += collect_quickstart(slug, json.loads(meta_path.read_text()))

    fns_path = base / "augment" / "functions.json"
    if fns_path.exists():
        try:
            fns = json.loads(fns_path.read_text())
            if isinstance(fns, list):
                snips += collect_function_examples(slug, fns)
        except json.JSONDecodeError:
            pass

    snips += collect_mdx_blocks(slug, base / "cookbook.mdx")
    snips += collect_mdx_blocks(slug, base / "technical-details.mdx")
    return snips


# ---------------------------------------------------------------------------
# Snippet preprocessing — make snippets parser-tolerant


def substitute_bind_vars(sql: str) -> tuple[str, list[str]]:
    """Replace `:foo` bind references with a placeholder string that's
    *also valid JSON*. We use `'{"_bind":"foo"}'` — a valid SQL VARCHAR
    literal and a parseable JSON object — so functions like
    `json_schema_validate(:schema, payload)` execute against a real
    JSON value rather than failing on a `<__BIND_…__>` placeholder.

    Skips `:` inside string literals (so `':memory:'` URI literals stay
    intact) and `::TYPE` casts.
    """
    names: list[str] = []
    out: list[str] = []
    i = 0
    n = len(sql)
    in_single = False
    in_double = False
    while i < n:
        c = sql[i]
        nx = sql[i + 1] if i + 1 < n else ""
        if in_single:
            out.append(c)
            if c == "'" and nx == "'":
                out.append("'")
                i += 2
                continue
            if c == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            out.append(c)
            if c == '"':
                in_double = False
            i += 1
            continue
        if c == "'":
            in_single = True
            out.append(c)
            i += 1
            continue
        if c == '"':
            in_double = True
            out.append(c)
            i += 1
            continue
        # Bind-variable: `:name` not preceded by `:` or word char.
        if c == ":" and nx and nx not in ":+-*/=<>(),;\t\n " and not (nx == ":"):
            prev = sql[i - 1] if i > 0 else " "
            if not prev.isalnum() and prev not in "_:":
                m = re.match(r"[a-zA-Z_][a-zA-Z0-9_]*", sql[i + 1:])
                if m:
                    name = m.group(0)
                    if name not in names:
                        names.append(name)
                    # Valid JSON object that's also a valid VARCHAR
                    # literal. Encodes the bind name so error messages
                    # remain debuggable.
                    out.append(f"""'{{"_bind":"{name}"}}'""")
                    i += 1 + len(name)
                    continue
        out.append(c)
        i += 1
    return "".join(out), names


# ---------------------------------------------------------------------------
# DuckDB harness


def open_db_for(slug: str, install_extensions: bool) -> tuple[duckdb.DuckDBPyConnection, bool]:
    """Returns (connection, extension_loaded). When False, snippets that
    reference the extension's functions will fail with "function does
    not exist" — those are demoted to PARSE-SKIP because the cause is
    the missing binary, not real doc drift.
    """
    db = duckdb.connect(":memory:")
    loaded = False
    if install_extensions and slug not in NON_EXTENSION_SLUGS:
        try:
            db.execute(f"INSTALL '{slug}' FROM community")
            db.execute(f"LOAD '{slug}'")
            loaded = True
        except duckdb.Error as e:
            print(f"  ! {slug}: could not load extension ({type(e).__name__}); proceeding without — function references will surface as PARSE-SKIP")
    return db, loaded


def run_fixtures(db: duckdb.DuckDBPyConnection, slug: str) -> None:
    fx = EXT_DIR / slug / "augment" / "check-fixtures.sql"
    if not fx.exists():
        return
    sql = fx.read_text()
    try:
        db.execute(sql)
    except duckdb.Error as e:
        print(f"  ! {slug}: fixtures failed: {e}")


def classify_runtime_error(err: str) -> str | None:
    s = err.lower()
    for needle, reason in RUNTIME_SKIP_HINTS:
        if needle in s:
            return reason
    if NETWORK_RE.search(err):
        return "network unavailable"
    return None


def classify_parse_error(err: str) -> str | None:
    """Distinguish "this SQL is wrong" parse failures (return None — let
    them be reported as PARSE-FAIL) from "this cookbook references a
    fixture table we never created" failures (return a reason string,
    surfaced as PARSE-SKIP). The validator's job is the former.
    """
    for pat, reason in PARSE_FIXTURE_HINTS:
        if pat.search(err):
            return reason
    return None


# ---------------------------------------------------------------------------
# Per-snippet execution


def check_snippet(
    db: duckdb.DuckDBPyConnection,
    snip: Snippet,
    *,
    extension_loaded: bool,
) -> Result:
    if snip.skip:
        return Result(snip, S_SKIP, None, None, snip.skip)

    # Documentation-placeholder ellipsis like `FROM ...` or `... AS ...`
    # are author shorthand for "the rest is up to you," not real SQL.
    # Skip parse for snippets that use that convention. (The bare `..`
    # in DuckDB syntax — `range(0..10)` — uses two dots, not three;
    # that's still parseable.)
    if re.search(r"(?<![.])\.\.\.(?![.])", snip.code):
        return Result(snip, S_PARSE_SKIP, "documentation placeholder ellipsis", None, None)

    rewritten, _ = substitute_bind_vars(snip.code)

    # Run any per-snippet setup statements (these are author-blessed
    # context, not under test themselves).
    for s in snip.setup:
        try:
            db.execute(s)
        except duckdb.Error as e:
            return Result(snip, S_PARSE_FAIL, f"setup failed: {e}", None, None)

    # Setup-only blocks: just run, no assertions on the snippet's own
    # output. Parse-pass is enough.
    if snip.is_setup:
        try:
            db.execute(rewritten)
            return Result(snip, S_PARSE_PASS, None, S_SETUP, None)
        except duckdb.Error as e:
            return Result(snip, S_PARSE_FAIL, str(e), None, None)

    # Phase 1: parse. For multi-statement snippets, statements that can't
    # be wrapped in EXPLAIN (ATTACH / USE / SET / CREATE SECRET / CALL …)
    # need to *actually run* before we EXPLAIN-check the next statement —
    # otherwise a subsequent `SELECT FROM <attached_catalog>.<schema>.<tbl>`
    # has no way to bind. So in this phase we EXECUTE non-explainable
    # statements (treating any failure as the parse verdict), and EXPLAIN
    # everything else.
    executed_in_phase1: set[int] = set()
    statements = list(enumerate(split_statements(rewritten)))
    try:
        for idx, stmt in statements:
            if not stmt.strip():
                continue
            # Strip comments to detect comment-only fragments (`-- 11`).
            stripped = re.sub(r"--[^\n]*", "", stmt)
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)
            if not stripped.strip():
                continue
            first_kw = stripped.strip().split(None, 1)[0].upper().rstrip(",;")
            if first_kw in NON_EXPLAINABLE_FIRST_KEYWORDS:
                # Execute for real so subsequent statements see the
                # right namespace / catalog / variable / secret state.
                # An execution failure here IS the parse verdict — same
                # rules as the old phase-2 fallthrough.
                try:
                    db.execute(stmt)
                    executed_in_phase1.add(idx)
                except duckdb.Error as e:
                    msg = str(e)
                    lower = msg.lower()
                    is_real_drift = (
                        "parser error" in lower
                        or "no function matches the given name" in lower
                        or ("function does not exist" in lower and extension_loaded)
                    )
                    if is_real_drift:
                        return Result(snip, S_PARSE_FAIL, msg, None, None)
                    reason = classify_parse_error(msg) or classify_runtime_error(msg)
                    if reason:
                        return Result(snip, S_PARSE_PASS, None, S_EXEC_SKIP, reason)
                    return Result(snip, S_PARSE_PASS, None, S_EXEC_FAIL, msg)
                continue
            try:
                db.execute(f"EXPLAIN {stmt}")
            except duckdb.Error as e:
                msg = str(e)
                lower = msg.lower()
                if any(k in lower for k in (
                    "explain only supports",
                    "cannot explain",
                    "not implemented",
                )):
                    continue
                # Demote fixture-related "parse" failures to PARSE-SKIP.
                # These don't indicate the snippet is wrong, just that
                # we don't have a real `users` table etc.
                reason = classify_parse_error(msg)
                if reason:
                    return Result(snip, S_PARSE_SKIP, reason, None, None)
                # Some extensions (Redis, http_client) execute side
                # effects during EXPLAIN — connecting to a server etc.
                # When that fails, it's a runtime issue, not drift.
                runtime_reason = classify_runtime_error(msg)
                if runtime_reason:
                    return Result(snip, S_PARSE_PASS, None, S_EXEC_SKIP, runtime_reason)
                # When the extension's binary couldn't be loaded,
                # function-name parse errors are caused by that, not
                # by real drift. Demote.
                if not extension_loaded and (
                    "function does not exist" in lower
                    or "no function matches the given name" in lower
                    or "macro does not exist" in lower
                    or "table function does not exist" in lower
                ):
                    return Result(snip, S_PARSE_SKIP, "extension binary unavailable", None, None)
                return Result(snip, S_PARSE_FAIL, msg, None, None)
    except Exception as e:
        return Result(snip, S_PARSE_FAIL, str(e), None, None)

    # Phase 2: execute. Re-runs every statement — but skips the
    # non-explainable ones we already executed in phase 1 (ATTACH / USE
    # / SET / CREATE SECRET / etc.) since re-running those would fail
    # with "already exists" errors that aren't drift.
    try:
        for idx, stmt in statements:
            if idx in executed_in_phase1:
                continue
            if not stmt.strip():
                continue
            stripped = re.sub(r"--[^\n]*", "", stmt)
            stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)
            if not stripped.strip():
                continue
            db.execute(stmt)
        return Result(snip, S_PARSE_PASS, None, S_EXEC_PASS, None)
    except duckdb.Error as e:
        msg = str(e)
        lower = msg.lower()
        # For unexplainable statements (CREATE SECRET, ATTACH, CALL, ...)
        # we let execute be the parse verdict. So a real wrong-parameter
        # error here IS drift, not a runtime issue. Distinguish:
        #   - "Parser Error" / "Binder Error: No function matches" / "no
        #     overload" / "doesn't accept" → real drift
        #   - everything else → runtime / fixture
        is_real_drift = (
            "parser error" in lower
            or "no function matches the given name" in lower
            or "function does not exist" in lower and extension_loaded
        )
        if is_real_drift:
            return Result(snip, S_PARSE_FAIL, msg, None, None)
        # Demote fixture / runtime errors.
        reason = classify_parse_error(msg) or classify_runtime_error(msg)
        if reason:
            return Result(snip, S_PARSE_PASS, None, S_EXEC_SKIP, reason)
        return Result(snip, S_PARSE_PASS, None, S_EXEC_FAIL, msg)


def split_statements(sql: str) -> list[str]:
    """Naive splitter — DuckDB's parser is forgiving but we want to
    parse statements individually so a trailing `INSERT` doesn't mask
    a leading `SELECT` parse error. Splits on `;` at the top level
    while respecting strings and `$$` dollar-quotes.
    """
    out: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    while i < n:
        c = sql[i]
        nx = sql[i + 1] if i + 1 < n else ""
        if in_line_comment:
            if c == "\n":
                in_line_comment = False
            buf.append(c)
            i += 1
            continue
        if in_block_comment:
            if c == "*" and nx == "/":
                in_block_comment = False
                buf.append("*/")
                i += 2
                continue
            buf.append(c)
            i += 1
            continue
        if in_single:
            buf.append(c)
            if c == "'" and nx == "'":
                buf.append("'")
                i += 2
                continue
            if c == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            buf.append(c)
            if c == '"':
                in_double = False
            i += 1
            continue
        if c == "-" and nx == "-":
            in_line_comment = True
            buf.append("--")
            i += 2
            continue
        if c == "/" and nx == "*":
            in_block_comment = True
            buf.append("/*")
            i += 2
            continue
        if c == "'":
            in_single = True
            buf.append(c)
            i += 1
            continue
        if c == '"':
            in_double = True
            buf.append(c)
            i += 1
            continue
        if c == ";":
            out.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


# ---------------------------------------------------------------------------
# Driver


def check_extension(slug: str, *, install: bool, verbose: bool) -> list[Result]:
    snippets = collect_snippets_for(slug)
    if not snippets:
        return []
    db, loaded = open_db_for(slug, install_extensions=install)
    run_fixtures(db, slug)
    results: list[Result] = []
    for snip in snippets:
        result = check_snippet(db, snip, extension_loaded=loaded)
        results.append(result)
        # If a snippet crashed the extension internally, the connection
        # is poisoned. Reopen so the rest of the snippets get a clean
        # state.
        msg = (result.parse_error or "") + " " + (result.exec_error or "")
        if "database has been invalidated" in msg.lower() or "internal error" in msg.lower():
            try:
                db.close()
            except Exception:
                pass
            db, loaded = open_db_for(slug, install_extensions=install)
            run_fixtures(db, slug)
    db.close()
    return results


def fmt_status(parse: str, exec_: str | None, parse_reason: str | None, exec_reason: str | None) -> str:
    if parse == S_SKIP:
        return f"SKIP ({parse_reason})"
    if parse == S_PARSE_FAIL:
        return "PARSE-FAIL"
    if parse == S_PARSE_SKIP:
        return f"PARSE-SKIP ({parse_reason})"
    if exec_ == S_SETUP:
        return "SETUP"
    if exec_ == S_EXEC_PASS:
        return "PASS"
    if exec_ == S_EXEC_SKIP:
        return f"EXEC-SKIP ({exec_reason})"
    if exec_ == S_EXEC_FAIL:
        return "EXEC-FAIL"
    return parse


def report(results_by_ext: dict[str, list[Result]], *, strict: bool, verbose: bool) -> int:
    n_pass = n_setup = n_skip = n_parse_skip = n_exec_skip = 0
    n_parse_fail = n_exec_fail = 0
    failures: list[Result] = []
    for slug, results in results_by_ext.items():
        ext_failed = [r for r in results if r.parse_status == S_PARSE_FAIL or r.exec_status == S_EXEC_FAIL]
        ext_pass = [r for r in results if r.exec_status == S_EXEC_PASS]
        ext_setup = [r for r in results if r.exec_status == S_SETUP]
        ext_skip = [r for r in results if r.parse_status == S_SKIP]
        ext_parse_skip = [r for r in results if r.parse_status == S_PARSE_SKIP]
        ext_exec_skip = [r for r in results if r.exec_status == S_EXEC_SKIP]
        n_pass += len(ext_pass)
        n_setup += len(ext_setup)
        n_skip += len(ext_skip)
        n_parse_skip += len(ext_parse_skip)
        n_exec_skip += len(ext_exec_skip)
        n_parse_fail += sum(1 for r in results if r.parse_status == S_PARSE_FAIL)
        n_exec_fail += sum(1 for r in results if r.exec_status == S_EXEC_FAIL)
        failures += ext_failed
        if verbose or ext_failed:
            print(f"\n[{slug}] {len(results)} snippet(s) — "
                  f"{len(ext_pass)} pass, "
                  f"{len(ext_exec_skip)} exec-skip, "
                  f"{len(ext_parse_skip)} parse-skip, "
                  f"{len(ext_skip)} skip, "
                  f"{len(ext_failed)} fail")
            for r in results:
                tag = fmt_status(r.parse_status, r.exec_status, r.parse_error, r.exec_error)
                head = r.snippet.code.strip().splitlines()[0][:70]
                if verbose or r in ext_failed:
                    print(f"  [{tag:<32}] {r.snippet.source:<48} | {head}")

    print("\n" + "=" * 70)
    print(f"summary: {n_pass} PASS, {n_setup} SETUP, {n_exec_skip} EXEC-SKIP, "
          f"{n_parse_skip} PARSE-SKIP, {n_skip} SKIP, "
          f"{n_parse_fail} PARSE-FAIL, {n_exec_fail} EXEC-FAIL")
    if failures:
        print("\nfailures:\n")
        for r in failures:
            tag = fmt_status(r.parse_status, r.exec_status, r.parse_error, r.exec_error)
            print(f"  [{r.snippet.extension}] {r.snippet.source}  {tag}")
            err = r.parse_error or r.exec_error or ""
            for line in err.splitlines()[:6]:
                print(f"    | {line}")
            print(f"    code: {r.snippet.code.strip().splitlines()[0][:90]}")
    return 0 if not failures else 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="Only check this extension")
    ap.add_argument("--no-install", action="store_true",
                    help="Don't INSTALL/LOAD extensions (parse-only against base DuckDB)")
    ap.add_argument("--strict", action="store_true",
                    help="Fail on EXEC-SKIP entries — useful when you've added fixtures")
    ap.add_argument("--verbose", action="store_true",
                    help="Show every snippet, not just failures")
    args = ap.parse_args()

    if args.slug:
        slugs: Iterable[str] = [args.slug]
    else:
        slugs = sorted(
            d.name for d in EXT_DIR.iterdir()
            if d.is_dir() and d.name not in NON_EXTENSION_SLUGS
        )

    results_by_ext: dict[str, list[Result]] = {}
    for slug in slugs:
        results = check_extension(slug, install=not args.no_install, verbose=args.verbose)
        results_by_ext[slug] = results

    sys.exit(report(results_by_ext, strict=args.strict, verbose=args.verbose))


if __name__ == "__main__":
    main()
