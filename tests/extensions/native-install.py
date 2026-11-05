"""Execute rendered installation SQL unchanged in an isolated native process."""

import json
import sys
from pathlib import Path

import duckdb

assert duckdb.__version__ == "2.0.0", "Install tests/extensions/native-requirements.txt"
request = json.load(sys.stdin)
directory = Path(request["directory"])
with duckdb.connect(config={
    "extension_directory": str(directory / "extensions"),
    "extension_repository_directory": str(directory / "repositories"),
}) as connection:
    # No preloading, SQL rewriting, community fallback, or unsigned extensions.
    connection.execute(request["sql"])
    result = connection.execute(
        "SELECT a5_lonlat_to_cell(-74.0060, 40.7128, 10) IS NOT NULL"
    ).fetchone()
    assert result == (True,), f"A5 must execute an extension function: {result}"
print("native-install-ok")
