#!/usr/bin/env python3
"""
Extension Diff Tool

This script is to be run in an extension's git repository root.

It uses the baseline duckdb build in ./duckdb/build/release/duckdb
to generate baseline data, then uses the debug build in ./build/debug/duckdb
to get the extension's data. The differences are calculated to determine
what the extension has added for each object type.

Output is JSON files compatible with the query-farm-astro extension documentation format.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import duckdb
import pyarrow.parquet as pq

BASELINE_DUCKDB = Path("./duckdb/build/release/duckdb")
DEBUG_DUCKDB = Path("./build/debug/duckdb")

OBJECT_TYPES = [
    "functions",
    "settings",
    "views",
    "schemas",
    "secret_types",
    "types",
]

# Settings to ignore (these are DuckDB internal settings that may appear as diffs)
IGNORED_SETTINGS = {"profiling_mode", "enable_profiling"}


def check_binary(path: Path, name: str, build_hint: str) -> None:
    """Check that a DuckDB binary exists and is executable."""
    if not path.exists():
        print(f"Error: {name} DuckDB binary not found at {path}", file=sys.stderr)
        print(f"Please build it first: {build_hint}", file=sys.stderr)
        sys.exit(1)

    if not os.access(path, os.X_OK):
        print(
            f"Error: {name} DuckDB binary at {path} is not executable", file=sys.stderr
        )
        sys.exit(1)


def get_duckdb_version(binary: Path) -> str:
    """Get the version string from a DuckDB binary."""
    result = subprocess.run(
        [str(binary), "-c", "SELECT version();"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error getting DuckDB version: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    # Parse version from output (format: "v1.2.3")
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.startswith("v"):
            return line
    return result.stdout.strip()


def check_version_match(baseline: Path, debug: Path) -> None:
    """Check that both DuckDB binaries have the same version."""
    baseline_version = get_duckdb_version(baseline)
    debug_version = get_duckdb_version(debug)

    if baseline_version != debug_version:
        print(
            f"Error: Version mismatch between baseline ({baseline_version}) "
            f"and debug ({debug_version})",
            file=sys.stderr,
        )
        print(
            "Both DuckDB builds must be the same version for accurate diffing.",
            file=sys.stderr,
        )
        sys.exit(1)


def run_duckdb_query(binary: Path, query: str) -> None:
    """Run a DuckDB query."""
    result = subprocess.run(
        [str(binary), "-c", query],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error running DuckDB query: {result.stderr}", file=sys.stderr)
        sys.exit(1)


def load_metadata_tables(
    binary: Path, temp_dir: Path, suffix: str
) -> dict[str, "pyarrow.Table"]:
    """Load all metadata tables from a DuckDB binary into PyArrow tables."""
    tables = {}

    for type_name in OBJECT_TYPES:
        output_file = temp_dir / f"{type_name}-{suffix}.parquet"
        query = f"COPY (SELECT * FROM duckdb_{type_name}()) TO '{output_file}';"

        run_duckdb_query(binary, query)
        tables[type_name] = pq.read_table(output_file)

    return tables


def map_function_type(func_type: str) -> str:
    """Map DuckDB function type to our schema type."""
    type_map = {
        "scalar": "scalar",
        "table": "table",
        "aggregate": "aggregate",
        "macro": "scalar",  # Macros are typically scalar-like
    }
    return type_map.get(func_type.lower(), "scalar")


def safe_list(value) -> list:
    """Convert a value to a list, handling numpy arrays and None."""
    if value is None:
        return []
    # Handle numpy arrays
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, list):
        return value
    return []


def safe_dict(value) -> dict:
    """Convert a value to a dict, handling None."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    return {}


def build_function_doc(row: dict) -> dict:
    """Build a FunctionDocData object from a DuckDB function row."""
    func_name = row.get("function_name", "unknown")
    func_type = map_function_type(row.get("function_type", "scalar"))

    # Build parameters from the function signature
    parameters = []
    param_types = safe_list(row.get("parameter_types"))
    param_names = safe_list(row.get("parameters"))

    for i, ptype in enumerate(param_types):
        param_name = param_names[i] if i < len(param_names) else f"arg{i}"
        parameters.append(
            {
                "name": param_name,
                "type": str(ptype) if ptype else "ANY",
                "paramType": "positional",
                "description": "",  # Needs manual documentation
            }
        )

    description = row.get("description")
    if not description:
        description = f"The {func_name} function."

    # Get categories from DuckDB (use first one as primary category)
    categories = safe_list(row.get("categories"))
    category = categories[0] if categories else "Uncategorized"

    # Get examples from DuckDB and convert to our format
    raw_examples = safe_list(row.get("examples"))
    examples = []
    for ex in raw_examples:
        if ex:
            examples.append({
                "description": "Example usage",
                "code": str(ex),
            })

    # Get tags from DuckDB (it's a MAP, extract keys or values)
    raw_tags = safe_dict(row.get("tags"))
    tags = list(raw_tags.keys()) if raw_tags else []

    return {
        "id": func_name.lower().replace(" ", "_"),
        "name": func_name,
        "type": func_type,
        "category": category,
        "returnType": str(row.get("return_type", "ANY")),
        "parameters": parameters,
        "description": description,
        "examples": examples,
        "tags": tags,
    }


def build_setting_doc(row: dict) -> dict:
    """Build a Pragma object from a DuckDB setting row."""
    name = row.get("name", "unknown")
    value = row.get("value", "")
    description = row.get("description", "") or f"The {name} setting."
    input_type = row.get("input_type", "VARCHAR")

    # Map input_type to our schema type
    type_map = {
        "VARCHAR": "string",
        "BOOLEAN": "boolean",
        "BIGINT": "number",
        "INTEGER": "number",
        "UBIGINT": "number",
        "DOUBLE": "number",
    }
    setting_type = type_map.get(input_type, "string")

    # Convert default value to appropriate type
    default_value: str | int | float | bool = value
    if setting_type == "boolean":
        default_value = value.lower() in ("true", "1", "yes", "on")
    elif setting_type == "number":
        try:
            default_value = int(value) if value else 0
        except ValueError:
            try:
                default_value = float(value) if value else 0.0
            except ValueError:
                default_value = value

    return {
        "name": name,
        "default": default_value,
        "description": description,
        "type": setting_type,
        "example": f"SET {name} = {repr(value) if setting_type == 'string' else value};",
    }


def build_type_doc(row: dict) -> dict:
    """Build a type documentation object from a DuckDB type row."""
    type_name = row.get("type_name", "unknown")
    return {
        "name": type_name,
        "category": row.get("type_category", "UNKNOWN"),
        "description": f"The {type_name} type.",
    }


def main() -> None:
    # Check that required DuckDB binaries exist
    check_binary(BASELINE_DUCKDB, "Baseline", "cd duckdb && make release")
    check_binary(DEBUG_DUCKDB, "Debug", "make debug")

    # Verify both binaries are the same DuckDB version
    check_version_match(BASELINE_DUCKDB, DEBUG_DUCKDB)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        print("Loading baseline metadata...")
        baseline_tables = load_metadata_tables(BASELINE_DUCKDB, temp_path, "baseline")

        print("Loading extension metadata...")
        extension_tables = load_metadata_tables(DEBUG_DUCKDB, temp_path, "extension")

        # Create a DuckDB connection and register all tables
        con = duckdb.connect()

        for type_name in OBJECT_TYPES:
            con.register(f"{type_name}_baseline", baseline_tables[type_name])
            con.register(f"{type_name}_extension", extension_tables[type_name])

        # Columns to exclude from comparison (internal IDs that differ between instances)
        EXCLUDE_COLUMNS = {
            "oid",
            "database_oid",
            "schema_oid",
            "function_oid",
            "view_oid",
            "scope",
        }

        results = {}

        for type_name in OBJECT_TYPES:
            # Get the columns to use for comparison (exclude internal columns)
            baseline_cols = set(baseline_tables[type_name].column_names)
            extension_cols = set(extension_tables[type_name].column_names)
            common_cols = (baseline_cols & extension_cols) - EXCLUDE_COLUMNS
            sorted_cols = sorted(common_cols)
            cols_str = ", ".join(sorted_cols)

            # Use EXCEPT on only the comparable columns
            diff_query = f"""
                SELECT {cols_str}
                FROM {type_name}_extension
                EXCEPT
                SELECT {cols_str}
                FROM {type_name}_baseline
            """

            diff_df = con.execute(diff_query).fetchdf()
            results[type_name] = diff_df.to_dict("records")

        con.close()

        # Process and output results
        output_dir = Path(".")

        # Functions
        functions = []
        for row in results["functions"]:
            func_doc = build_function_doc(row)
            functions.append(func_doc)

        if functions:
            functions_file = output_dir / "functions.json"
            with open(functions_file, "w") as f:
                json.dump(functions, f, indent=2)
            print(f"\nWrote {len(functions)} functions to {functions_file}")

        # Settings (pragmas)
        settings = []
        for row in results["settings"]:
            name = row.get("name", "")
            if name in IGNORED_SETTINGS:
                continue
            setting_doc = build_setting_doc(row)
            settings.append(setting_doc)

        if settings:
            settings_file = output_dir / "settings.json"
            with open(settings_file, "w") as f:
                json.dump(settings, f, indent=2)
            print(f"Wrote {len(settings)} settings to {settings_file}")

        # Types
        types = []
        for row in results["types"]:
            type_doc = build_type_doc(row)
            types.append(type_doc)

        if types:
            types_file = output_dir / "types.json"
            with open(types_file, "w") as f:
                json.dump(types, f, indent=2)
            print(f"Wrote {len(types)} types to {types_file}")

        # Summary
        print("\n" + "=" * 60)
        print("EXTENSION DIFF SUMMARY")
        print("=" * 60)
        print(f"  Functions: {len(functions)}")
        print(f"  Settings:  {len(settings)}")
        print(f"  Types:     {len(types)}")
        print(f"  Views:     {len(results['views'])}")
        print(f"  Schemas:   {len(results['schemas'])}")
        print(f"  Secrets:   {len(results['secret_types'])}")

        # Note about manual work needed
        if functions:
            print("\nNOTE: Generated function documentation needs manual enhancement:")
            print("  - Add meaningful descriptions")
            print("  - Categorize functions")
            print("  - Add usage examples")
            print("  - Add related functions and tags")


if __name__ == "__main__":
    main()
