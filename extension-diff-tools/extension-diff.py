#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "duckdb>=1.4",
#   "pyarrow>=17",
# ]
# ///
"""
Extension Diff Tool

Run from an extension's git repository root. Uses the baseline DuckDB build
at ./duckdb/build/release/duckdb and the extension-loaded debug build at
./build/debug/duckdb to compute what the extension contributes, then writes
site-shaped JSON files into <site>/src/data/extensions/<slug>/generated/.

The extension is the source of truth for facts DuckDB can introspect
(signatures, raw description, base examples). The site augments these in
<site>/src/data/extensions/<slug>/augment/. This tool only writes to
generated/ — augment/ files are never touched on subsequent runs.

Usage:
  extension-diff.py --site <site-repo> --slug <extension-slug> [--init]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import duckdb
import pyarrow.parquet as pq

DEFAULT_BASELINE_DUCKDB = Path("./duckdb/build/release/duckdb")
DEFAULT_DEBUG_DUCKDB = Path("./build/debug/duckdb")

OBJECT_TYPES = [
    "functions",
    "settings",
    "views",
    "schemas",
    "secret_types",
    "types",
]

IGNORED_SETTINGS = {"profiling_mode", "enable_profiling"}


def check_binary(path: Path, name: str, build_hint: str) -> None:
    if not path.exists():
        print(f"Error: {name} DuckDB binary not found at {path}", file=sys.stderr)
        print(f"Please build it first: {build_hint}", file=sys.stderr)
        sys.exit(1)
    if not os.access(path, os.X_OK):
        print(f"Error: {name} DuckDB binary at {path} is not executable", file=sys.stderr)
        sys.exit(1)


def get_duckdb_version(binary: Path) -> str:
    result = subprocess.run([str(binary), "-c", "SELECT version();"], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error getting DuckDB version: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.startswith("v"):
            return line
    return result.stdout.strip()


def check_version_match(baseline: Path, debug: Path) -> None:
    bv, dv = get_duckdb_version(baseline), get_duckdb_version(debug)
    if bv != dv:
        print(f"Error: Version mismatch baseline ({bv}) vs debug ({dv})", file=sys.stderr)
        sys.exit(1)


def run_duckdb_query(binary: Path, query: str) -> None:
    result = subprocess.run([str(binary), "-c", query], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running DuckDB query: {result.stderr}", file=sys.stderr)
        sys.exit(1)


def load_metadata_tables(binary: Path, temp_dir: Path, suffix: str, preamble: str = ""):
    tables = {}
    for type_name in OBJECT_TYPES:
        output_file = temp_dir / f"{type_name}-{suffix}.parquet"
        query = f"{preamble}COPY (SELECT * FROM duckdb_{type_name}()) TO '{output_file}';"
        run_duckdb_query(binary, query)
        tables[type_name] = pq.read_table(output_file)
    return tables


def list_loaded_extensions(binary: Path, preamble: str = "") -> list[str]:
    """Return names of all extensions currently loaded in a fresh CLI session
    after running `preamble`."""
    query = (
        f"{preamble}"
        "COPY (SELECT extension_name FROM duckdb_extensions() WHERE loaded) "
        "TO '/dev/stdout' (FORMAT CSV, HEADER FALSE);"
    )
    result = subprocess.run(
        [str(binary), "-c", query], capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error listing extensions: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def list_baseline_function_names(binary: Path, preamble: str = "") -> set[str]:
    """Return the set of function names registered in the baseline session
    (transitive deps loaded but target extension NOT loaded). Used to filter
    out overloads that contribute new rows under existing names — these
    belong to the dependency's namespace, not the target extension's."""
    query = (
        f"{preamble}"
        "COPY (SELECT DISTINCT function_name FROM duckdb_functions()) "
        "TO '/dev/stdout' (FORMAT CSV, HEADER FALSE);"
    )
    result = subprocess.run(
        [str(binary), "-c", query], capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error listing baseline functions: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def coerce_str(v, default: str = "") -> str:
    """Convert a possibly-nan/None DataFrame value to a string. pandas turns
    NULL VARCHARs into float('nan'), which would round-trip as the JSON-invalid
    literal `NaN` if we let it through unsanitized."""
    if v is None:
        return default
    if isinstance(v, float):
        # nan != nan
        if v != v:
            return default
        return str(v)
    return str(v)


def safe_list(value) -> list:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, list):
        return value
    return []


def safe_dict(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    return {}


def map_function_type(func_type: str) -> str:
    return {"scalar": "scalar", "table": "table", "aggregate": "aggregate", "macro": "scalar"}.get(
        func_type.lower(), "scalar"
    )


def function_signature_id(name: str, param_types: list) -> str:
    """Stable id for a (possibly overloaded) function: name + param type list."""
    sig = ",".join(str(t) for t in param_types) if param_types else ""
    return f"{name}({sig})" if sig else name


def execute_example(con, expr: str) -> dict | None:
    """Run `SELECT <expr>` against an extension-loaded connection and return
    {columns, rows} suitable for the site's `outputTable` shape, or None on error.
    Values are stringified — DuckDB's display (lists, structs, big ints) survives
    JSON better as strings."""
    try:
        cur = con.execute(f"SELECT {expr}")
        rows = cur.fetchall()
    except Exception as e:
        print(f"  [skip example] {expr!r}: {e}", file=sys.stderr)
        return None
    columns = [{"name": d[0], "align": "left"} for d in (cur.description or [])]
    serialized = []
    for row in rows:
        serialized.append([
            "" if v is None else
            ("true" if v is True else "false") if isinstance(v, bool) else
            str(v)
            for v in row
        ])
    return {"columns": columns, "rows": serialized}


def build_function_doc(row: dict, exec_con=None) -> dict:
    """site-shaped FunctionDocData from a duckdb_functions() row.

    Generated-only fields. Augment may layer on categories, rich description,
    curated examples, relatedFunctions, tags.
    """
    name = row.get("function_name", "unknown")
    func_type = map_function_type(row.get("function_type", "scalar"))
    param_types = safe_list(row.get("parameter_types"))
    param_names = safe_list(row.get("parameters"))

    parameters = []
    # Only table functions can have named parameters in DuckDB. For table
    # functions, `duckdb_functions().parameters` concatenates positional and
    # named parameters into one array — positional ones get auto-generated
    # `colN` names while named ones carry their real keys. For everything
    # else (scalar / aggregate / macro), all params are positional regardless
    # of their name (the name is just the human-readable identifier).
    import re as _re
    POSITIONAL_RE = _re.compile(r"^col\d+$")
    is_table_function = (row.get("function_type") or "").lower() == "table"
    for i, ptype in enumerate(param_types):
        pname = param_names[i] if i < len(param_names) else f"arg{i}"
        is_named = is_table_function and not POSITIONAL_RE.match(pname)
        parameters.append({
            "name": pname,
            "type": str(ptype) if ptype else "ANY",
            "paramType": "named" if is_named else "positional",
            "description": "",
        })

    if row.get("varargs"):
        parameters.append({
            "name": "varargs",
            "type": str(row.get("varargs")),
            "paramType": "positional",
            "description": "",
            "varargs": True,
        })

    raw_examples = safe_list(row.get("examples"))
    examples = []
    # Some extensions register examples as full statements ("SELECT foo(1)"),
    # others as bare expressions ("foo(1)"). Detect leading SQL keywords so
    # we don't double-up to "SELECT SELECT foo(1);".
    import re as _re
    STATEMENT_RE = _re.compile(r"^\s*(SELECT|WITH|CREATE|INSERT|UPDATE|DELETE|PRAGMA|ATTACH|COPY|EXPLAIN|SHOW|DESCRIBE|CALL)\b",
                               _re.IGNORECASE)
    for ex in raw_examples:
        if not ex:
            continue
        ex_str = str(ex).strip()
        is_full_statement = bool(STATEMENT_RE.match(ex_str))
        # For display: full statements pass through; bare expressions get
        # wrapped in SELECT … ; so they're runnable as-is.
        display_code = ex_str if is_full_statement else f"SELECT {ex_str};"
        if not display_code.rstrip().endswith(";"):
            display_code = display_code.rstrip() + ";"
        entry: dict = {"description": "", "code": display_code}
        if exec_con is not None:
            # For execution: strip a trailing semicolon and a leading SELECT
            # keyword (the python connection's `execute` accepts either, but
            # we want the same result-shaping as bare-expression examples).
            run_sql = ex_str.rstrip(";").strip()
            if not is_full_statement:
                run_sql = run_sql  # bare expr → execute_example prepends SELECT
                output_table = execute_example(exec_con, run_sql)
            else:
                # Full statement: execute directly and capture columns/rows.
                try:
                    cur = exec_con.execute(run_sql)
                    rows = cur.fetchall() if cur.description else []
                    if cur.description:
                        cols = [{"name": d[0], "align": "left"} for d in cur.description]
                        serialized = [
                            ["" if v is None else
                             ("true" if v is True else "false") if isinstance(v, bool) else
                             str(v)
                             for v in row]
                            for row in rows
                        ]
                        output_table = {"columns": cols, "rows": serialized}
                    else:
                        output_table = None
                except Exception as e:
                    print(f"  [skip example] {ex_str!r}: {e}", file=sys.stderr)
                    output_table = None
            if output_table is not None:
                entry["outputTable"] = output_table
        examples.append(entry)

    tags = safe_dict(row.get("tags"))

    return {
        "id": function_signature_id(name, param_types),
        "name": name,
        "type": func_type,
        "returnType": str(row.get("return_type", "ANY")),
        "parameters": parameters,
        "description": coerce_str(row.get("description")),
        "examples": examples,
        **({"tags": tags} if tags else {}),
    }


def build_pragma_doc(row: dict) -> dict:
    name = row.get("name", "unknown")
    value = row.get("value", "")
    input_type = row.get("input_type", "VARCHAR")
    type_map = {"VARCHAR": "string", "BOOLEAN": "boolean", "BIGINT": "number",
                "INTEGER": "number", "UBIGINT": "number", "DOUBLE": "number"}
    # Coarse category drives badge colour / default coercion. Anything we don't
    # model as a scalar (MAP, LIST, STRUCT, ...) is a "map"-style structured
    # value rendered verbatim. `valueType` carries the real DuckDB type so the
    # docs can show it faithfully (e.g. "MAP(VARCHAR, BIGINT)", "UBIGINT").
    setting_type = type_map.get(input_type, "string")
    if input_type.startswith(("MAP", "STRUCT", "LIST", "UNION")):
        setting_type = "map"

    default_value = value
    if setting_type == "boolean":
        default_value = str(value).lower() in ("true", "1", "yes", "on")
    elif setting_type == "number":
        try:
            default_value = int(value) if value else 0
        except (ValueError, TypeError):
            try:
                default_value = float(value) if value else 0.0
            except (ValueError, TypeError):
                default_value = value

    return {
        "name": name,
        "default": default_value,
        "type": setting_type,
        "valueType": input_type,
        "description": coerce_str(row.get("description")),
    }


def build_secret_type_doc(row: dict) -> dict:
    type_name = row.get("type") or row.get("type_name") or "unknown"
    return {
        "id": str(type_name).lower(),
        "name": str(type_name),
        "type": str(type_name),
        "parameters": [],
        "description": "",
        "examples": [],
    }


def build_type_doc(row: dict) -> dict:
    type_name = row.get("type_name", "unknown")
    return {
        "id": str(type_name).lower(),
        "name": str(type_name),
        "category": str(row.get("type_category", "UNKNOWN")),
        "description": "",
    }


def build_view_doc(row: dict) -> dict:
    return {
        "name": row.get("view_name", "unknown"),
        "schema": row.get("schema_name"),
        "definition": row.get("sql"),
    }


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # allow_nan=False: refuse to emit NaN/Infinity (which Vite rejects).
    path.write_text(json.dumps(data, indent=2, default=str, allow_nan=False) + "\n")
    print(f"  wrote {path}")


def write_metadata_stub(augment_dir: Path, slug: str) -> None:
    """Create an empty metadata.json scaffold so a new extension is editable
    immediately. Never overwrites an existing file."""
    path = augment_dir / "metadata.json"
    if path.exists():
        return
    augment_dir.mkdir(parents=True, exist_ok=True)
    stub = {
        "name": slug,
        "displayName": slug,
        "icon": "📦",
        "description": f"TODO: short description for {slug}.",
        "githubUrl": "",
        "cta": {
            "title": f"Start Using {slug}",
            "description": f"TODO: install/usage hook for {slug}."
        }
    }
    path.write_text(json.dumps(stub, indent=2) + "\n")
    print(f"  scaffolded {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, type=Path, help="Path to query-farm-astro site repo")
    ap.add_argument("--slug", required=True, help="Extension slug (folder name in src/data/extensions/)")
    ap.add_argument("--community", action="store_true",
                    help="Use a single duckdb CLI; load extension via INSTALL ... FROM community; LOAD")
    ap.add_argument("--haybarn", action="store_true",
                    help="Scan against Haybarn (Query.Farm's DuckDB distribution) instead of "
                         "DuckDB. Implies --community, routes the CLI through the bundled "
                         "`haybarn` wrapper (override with HAYBARN_CMD), and skips the "
                         "DuckDB-only step that can't see a Haybarn extension: in-process "
                         "example baking.")
    ap.add_argument("--duckdb", type=Path, default=Path("duckdb"),
                    help="DuckDB CLI binary to use in --community mode (default: PATH lookup)")
    ap.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE_DUCKDB,
                    help="Two-build mode: baseline (no extension) duckdb binary")
    ap.add_argument("--debug", type=Path, default=DEFAULT_DEBUG_DUCKDB,
                    help="Two-build mode: extension-loaded duckdb binary")
    ap.add_argument("--init", action="store_true", help="Scaffold augment/metadata.json if missing")
    ap.add_argument("--also-load", action="append", default=[], metavar="EXT",
                    help="Additional extension(s) to LOAD in BOTH baseline and "
                         "extension sessions. Use for extensions that overload "
                         "another extension's functions (e.g. --also-load spatial "
                         "for geosilo). Repeatable.")
    args = ap.parse_args()

    # Haybarn mode is community-mode capture routed through the Haybarn CLI.
    if args.haybarn:
        args.community = True
        # Default the CLI to the bundled wrapper unless the caller overrode it.
        if args.duckdb == Path("duckdb"):
            args.duckdb = Path(__file__).resolve().parent / "haybarn"

    if args.community:
        # Resolve duckdb binary from PATH if a bare name was given.
        duckdb_bin = args.duckdb
        if not duckdb_bin.is_absolute() and not duckdb_bin.exists():
            from shutil import which
            resolved = which(str(duckdb_bin))
            if not resolved:
                print(f"Error: duckdb CLI '{duckdb_bin}' not found on PATH", file=sys.stderr)
                sys.exit(1)
            duckdb_bin = Path(resolved)
        check_binary(duckdb_bin, "DuckDB", "brew install duckdb")
        # Extensions named via --also-load are installed-and-loaded in both
        # baseline and extension sessions, so the diff cleanly shows only the
        # target's contribution above and beyond them.
        also_preamble = "".join(f"INSTALL {e}; LOAD {e}; " for e in args.also_load)
        # In Haybarn mode, FORCE INSTALL the target so a rescan always pulls the
        # latest published build past Haybarn's on-disk extension cache (a plain
        # INSTALL is a no-op when a stale copy is already installed).
        install_verb = "FORCE INSTALL" if args.haybarn else "INSTALL"
        load_preamble = f"{also_preamble}{install_verb} {args.slug} FROM community; LOAD {args.slug}; "
    else:
        check_binary(args.baseline, "Baseline", "cd duckdb && make release")
        check_binary(args.debug, "Debug", "make debug")
        check_version_match(args.baseline, args.debug)

    ext_dir = args.site / "src/data/extensions" / args.slug
    generated_dir = ext_dir / "generated"
    augment_dir = ext_dir / "augment"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        if args.community:
            # First, discover the full transitive set of extensions that get
            # loaded by `LOAD <slug>` so we can pre-load all but the target
            # into the baseline. Otherwise the diff leaks contributions from
            # auto-loaded deps (e.g. httpfs, aws).
            print(f"Discovering transitive extensions loaded by {args.slug}...")
            loaded = list_loaded_extensions(duckdb_bin, preamble=load_preamble)
            transitive = [e for e in loaded if e != args.slug]
            if transitive:
                print(f"  transitive deps: {', '.join(transitive)}")
            # Most transitive deps for community extensions are built-in
            # extensions (core_functions, parquet, json, icu, httpfs, ...) which
            # only need LOAD, not INSTALL. INSTALL fails for shell-only or
            # already-statically-linked ones. Use LOAD; the CLI returns success
            # if the extension is available statically or already installed.
            baseline_preamble = (
                "".join(f"LOAD {e}; " for e in transitive)
                + "".join(f"INSTALL {e}; LOAD {e}; " for e in args.also_load)
            )

            print(f"Capturing baseline metadata (with deps {transitive or 'none'} loaded)...")
            baseline_tables = load_metadata_tables(duckdb_bin, temp_path, "baseline", preamble=baseline_preamble)
            print(f"Capturing extension metadata (INSTALL {args.slug} FROM community; LOAD)...")
            extension_tables = load_metadata_tables(duckdb_bin, temp_path, "extension", preamble=load_preamble)
            # Function names already claimed by a dependency — filter these
            # out post-diff so we don't list overloads in another extension's
            # namespace as a contribution of this extension.
            baseline_function_names = list_baseline_function_names(duckdb_bin, preamble=baseline_preamble)
        else:
            print("Loading baseline metadata...")
            baseline_tables = load_metadata_tables(args.baseline, temp_path, "baseline")
            print("Loading extension metadata...")
            extension_tables = load_metadata_tables(args.debug, temp_path, "extension")
            baseline_function_names = list_baseline_function_names(args.baseline)

        con = duckdb.connect()
        for type_name in OBJECT_TYPES:
            con.register(f"{type_name}_baseline", baseline_tables[type_name])
            con.register(f"{type_name}_extension", extension_tables[type_name])

        EXCLUDE_COLUMNS = {"oid", "database_oid", "schema_oid", "function_oid", "view_oid", "scope"}

        results = {}
        for type_name in OBJECT_TYPES:
            common = (set(baseline_tables[type_name].column_names) &
                      set(extension_tables[type_name].column_names)) - EXCLUDE_COLUMNS
            cols = ", ".join(sorted(common))
            diff_query = f"SELECT {cols} FROM {type_name}_extension EXCEPT SELECT {cols} FROM {type_name}_baseline"
            # Arrow → Python dicts. NULLs come through as None (vs pandas' nan)
            # and big ints stay as Python ints — no float coercion gotchas.
            results[type_name] = con.execute(diff_query).fetch_arrow_table().to_pylist()
        con.close()

        # Drop functions whose name already exists in a dependency's namespace
        # (e.g. ST_X overloads added by an extension on top of `spatial`).
        before = len(results["functions"])
        results["functions"] = [r for r in results["functions"]
                                if r.get("function_name") not in baseline_function_names]
        dropped = before - len(results["functions"])
        if dropped:
            print(f"  filtered out {dropped} function rows that overload "
                  f"names already in dependency namespaces")

        print(f"\nWriting to {generated_dir}/")

        # In community mode, open a second connection with the extension loaded
        # so we can execute each example expression and capture its result.
        exec_con = None
        if args.community and not args.haybarn:
            exec_con = duckdb.connect()
            exec_con.execute(f"INSTALL {args.slug} FROM community")
            exec_con.execute(f"LOAD {args.slug}")
        elif args.haybarn:
            # The in-process python `duckdb` module is plain DuckDB and can't
            # load a Haybarn-only extension. Skip baking example outputs here;
            # author curated examples in augment/ and bake them with a
            # Haybarn-backed run later.
            print("Haybarn mode: skipping in-process example baking "
                  "(no DuckDB engine for a Haybarn extension).")
        try:
            # Functions (split macros out into their own file)
            functions, macros = [], []
            for row in results["functions"]:
                ftype = (row.get("function_type") or "").lower()
                if ftype == "macro":
                    macros.append({
                        "id": row.get("function_name", "unknown"),
                        "name": row.get("function_name", "unknown"),
                        "definition": coerce_str(row.get("macro_definition")),
                        "description": coerce_str(row.get("description")),
                        "examples": [],
                    })
                else:
                    functions.append(build_function_doc(row, exec_con=exec_con))
        finally:
            if exec_con is not None:
                exec_con.close()
        if functions:
            write_json(generated_dir / "functions.json", functions)
        if macros:
            write_json(generated_dir / "macros.json", macros)

        pragmas = [build_pragma_doc(r) for r in results["settings"] if r.get("name") not in IGNORED_SETTINGS]
        if pragmas:
            write_json(generated_dir / "pragmas.json", pragmas)

        secrets = [build_secret_type_doc(r) for r in results["secret_types"]]
        if secrets:
            write_json(generated_dir / "secrets.json", secrets)

        types = [build_type_doc(r) for r in results["types"]]
        if types:
            write_json(generated_dir / "types.json", types)

        views = [build_view_doc(r) for r in results["views"]]
        if views:
            write_json(generated_dir / "views.json", views)

        # compatibility.json is not written here. binary-sizes-snapshot.py,
        # which probes haybarn-extensions.query.farm/community — the
        # distribution this site's in-browser REPL actually installs
        # from — is the single definitive source for platform/WASM
        # compatibility. It used to race this tool's own upstream
        # (community-extensions.duckdb.org) probe for the same file, with
        # whichever ran most recently silently winning; that produced stale
        # or wrong WASM-availability data depending on run order. Run
        # `binary-sizes-snapshot.py --site <site> --slug <slug>` (or
        # `npm run refresh:snapshots`) to (re)generate it.

        if args.init:
            write_metadata_stub(augment_dir, args.slug)

        print("\n" + "=" * 60)
        print(f"EXTENSION DIFF SUMMARY ({args.slug})")
        print("=" * 60)
        print(f"  Functions: {len(functions)}")
        print(f"  Macros:    {len(macros)}")
        print(f"  Pragmas:   {len(pragmas)}")
        print(f"  Secrets:   {len(secrets)}")
        print(f"  Types:     {len(types)}")
        print(f"  Views:     {len(views)}")
        print(f"\nNext: edit augment/ files at {augment_dir} to add categories,")
        print(f"rich descriptions, curated examples, related functions, etc.")


if __name__ == "__main__":
    main()
