"""Capture a published extension's catalog; run with the matching Haybarn wheel.

The parent launches one process per extension. Dependencies are loaded in a
separate baseline connection so their registrations aren't attributed to it.
Only registration metadata is collected; developer examples are not executed.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import haybarn

parser = argparse.ArgumentParser()
parser.add_argument("name")
parser.add_argument("--version", required=True)
args = parser.parse_args()
if not re.fullmatch(r"[a-zA-Z0-9_]+", args.name):
    raise ValueError("Invalid extension name")
root = Path(__file__).resolve().parents[2]
cache = root / ".cache/haybarn-extensions/inventory" / args.version / args.name
cache.mkdir(parents=True, exist_ok=True)

def connect():
    return haybarn.connect(config={"extension_directory": str(cache)})

def rows(connection, sql):
    cursor = connection.execute(sql)
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]

def loaded(connection):
    return rows(connection, "SELECT extension_name, extension_version, install_path, installed_from FROM duckdb_extensions() WHERE loaded")

def catalog(connection):
    return {kind: rows(connection, f"SELECT * FROM duckdb_{kind}()") for kind in ["functions", "settings", "types", "secret_types", "views", "schemas"]}

def key(kind, row):
    fields = {
        "functions": ["schema_name", "function_name", "function_type", "parameter_types", "parameters", "varargs", "return_type"],
        "settings": ["name"], "types": ["schema_name", "type_name"],
        "secret_types": ["type"], "views": ["schema_name", "view_name"], "schemas": ["schema_name"],
    }[kind]
    return json.dumps([row.get(field) for field in fields], sort_keys=True)

connection = connect()
version = rows(connection, "SELECT * FROM pragma_version()")[0]
if version["library_version"] != "v" + args.version:
    raise ValueError(f"Engine mismatch: {version}")
platform = rows(connection, "PRAGMA platform")[0]["platform"]
before_loaded = {row["extension_name"] for row in loaded(connection)}
connection.execute(f"FORCE INSTALL {args.name} FROM community")
connection.execute(f"LOAD {args.name}")
after_loaded = loaded(connection)
extension = next(row for row in after_loaded if row["extension_name"] == args.name)
dependencies = [row["extension_name"] for row in after_loaded if row["extension_name"] not in before_loaded and row["extension_name"] != args.name]
baseline = connect()
for dependency in dependencies:
    if not re.fullmatch(r"[a-zA-Z0-9_]+", dependency): raise ValueError("Invalid dependency")
    baseline.execute(f"LOAD {dependency}")
before, after = catalog(baseline), catalog(connection)
inventory = {}
for kind in after:
    existing = {key(kind, row) for row in before[kind]}
    inventory[kind] = [{k: v for k, v in row.items() if not k.endswith("_oid")} for row in after[kind] if key(kind, row) not in existing]
    inventory[kind].sort(key=lambda row: key(kind, row))

# Positional arguments on the table-function catalog usually use colN. Bind
# candidate names to distinguish named options without assuming that spelling.
# Binder errors list candidate signatures before any file/network access.
for function in inventory["functions"]:
    if function["function_type"] != "table": continue
    name = function["function_name"]
    safe_name = '"' + name.replace('"', '""') + '"'
    try:
        connection.execute(f"EXPLAIN SELECT * FROM {safe_name}(__haybarn_unknown_argument__ := NULL)")
        raise ValueError(f"Could not resolve named arguments for {name}")
    except haybarn.BinderException as error:
        message = str(error)
        marker = re.search(r"Candidates?:\s*\n([\s\S]+?)(?:\n\s*LINE|$)", message)
        # Catalog names (colN) are engine generated; verify them against the
        # candidate signature rather than inferring optionality or defaults.
        candidate = marker.group(1) if marker else message
        named = [p for p in function["parameters"] if re.search(r"\b" + re.escape(p) + r"\s*:\s*", candidate)]
        function["named_parameters"] = named
        function["binding_evidence"] = message

artifact = Path(extension["install_path"])
result = {
    "name": args.name, "capturedAt": datetime.now(timezone.utc).isoformat(),
    "engine": {**version, "platform": platform},
    "extensionVersion": extension["extension_version"],
    "artifactSHA256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
    "artifactURL": f"https://haybarn-extensions.query.farm/community/v{args.version}/{platform}/{args.name}.duckdb_extension.gz",
    "dependencies": dependencies, **inventory,
}
destination = root / "src/data/haybarn-extensions/inventories" / (args.name + ".json")
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(result, indent=2, default=str) + "\n")
print(json.dumps({"name": args.name, "engine": version, "objects": {kind: len(value) for kind, value in inventory.items()}}))
connection.close()
baseline.close()
