# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6,<7"]
# ///
"""Normalize the community descriptors without interpreting availability."""
import json
import sys
from pathlib import Path

import yaml

records = []
for path in sorted((Path(sys.argv[1]) / "extensions").glob("*/description.yml")):
    descriptor = yaml.safe_load(path.read_text())
    extension = descriptor["extension"]
    docs = descriptor.get("docs") or {}
    if isinstance(docs, str):
        docs = {"extended_description": docs}
    records.append({
        "name": path.parent.name,
        "description": extension.get("description", ""),
        "license": extension.get("license") or extension.get("licence"),
        "maintainers": extension.get("maintainers", []),
        "language": extension.get("language"),
        "repo": descriptor.get("repo", {}),
        "docs": docs,
    })
print(json.dumps(records))
