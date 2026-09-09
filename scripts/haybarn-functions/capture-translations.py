"""Generate the displayed dialect examples from a local SQLGlot checkout."""
import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--repo", type=Path, default=Path(".cache/sqlglot"))
parser.add_argument("--examples", type=Path, default=Path(__file__).with_name("translation-examples.json"))
parser.add_argument("--audit", type=Path, default=Path(".cache/sqlglot-audit.json"))
args = parser.parse_args()
sys.path.insert(0, str(args.repo.resolve()))

from sqlglot import Dialect, ErrorLevel, exp, parse_one
from sqlglot.tokens import TokenType

commit = subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", "HEAD"], text=True).strip()
audit = json.loads(args.audit.read_text())
if audit["sqlglot"]["commit"] != commit:
    parser.error("Regenerate the SQLGlot audit for this checkout before capturing translations.")
engine_labels = {
    "bigquery": "BigQuery", "clickhouse": "ClickHouse", "dremio": "Dremio",
    "exasol": "Exasol", "hive": "Apache Hive", "mysql": "MySQL", "oracle": "Oracle",
    "postgres": "PostgreSQL", "presto": "Presto", "redshift": "Amazon Redshift",
    "snowflake": "Snowflake", "spark": "Apache Spark", "spark2": "Apache Spark 2",
    "sqlite": "SQLite", "starrocks": "StarRocks", "trino": "Trino", "tsql": "SQL Server",
}


def called_names(sql, dialect):
    tokens = Dialect.get_or_raise(dialect).tokenize(sql)
    syntax = {"as", "in", "over", "within", "group", "values", "select", "exists", "table", "with"}
    return sorted({token.text.lower() for token, following in zip(tokens, tokens[1:])
                   if following.token_type == TokenType.L_PAREN
                   and re.fullmatch(r"[A-Za-z_]\w*", token.text)
                   and token.text.lower() not in syntax})


def relation(name, sql):
    query = parse_one(sql, read="duckdb")
    expressions = query.expressions if isinstance(query, exp.Select) else [query]
    for node in expressions:
        while isinstance(node, (exp.Alias, exp.Cast, exp.TryCast, exp.Window, exp.Paren, exp.IgnoreNulls, exp.RespectNulls)):
            node = node.this
        original_name = sql[node.meta.get("start", 0):node.meta.get("end", -1) + 1].lower()
        rendered = node.sql(dialect="duckdb")
        if original_name == name or re.match(rf"^{re.escape(name)}\s*\(", rendered, re.I):
            return "direct"
        operators = {"+": exp.Add, "-": exp.Sub, "*": exp.Mul, "/": exp.Div, "&": exp.BitwiseAnd, "|": exp.BitwiseOr, "~": exp.BitwiseNot}
        if name in operators and isinstance(node, operators[name]):
            return "direct"
    return "rewrite"


# Example inputs are editorial; SQL rewrites and format mappings come from SQLGlot.
data = []
for example in json.loads(args.examples.read_text()):
    dialect = example["source"]["dialect"]
    query = parse_one(example["source"]["sql"], read=dialect)
    source = Dialect.get_or_raise(dialect).generator()
    target = Dialect.get_or_raise("duckdb").generator()
    tokens = []
    # Retained in the structured export for consumers; not shown on the page.
    for expression in query.find_all(exp.TimeToStr):
        format_string = expression.args.get("format")
        if not isinstance(format_string, exp.Literal) or not format_string.is_string:
            continue
        for token in dict.fromkeys(re.findall(r"%[A-Za-z]", format_string.this)):
            sample = expression.copy()
            sample.set("format", exp.Literal.string(token))
            tokens.append({"source": parse_one(source.format_time(sample), read=dialect).this,
                           "target": parse_one(target.format_time(sample), read="duckdb").this})
    data.append({
        "function": example["function"], "relation": "direct",
        "scope": example["scope"],
        "source": {**example["source"], "names": called_names(example["source"]["sql"], dialect),
                   "sql": query.sql(dialect=dialect, pretty=True, max_text_width=80) + ";"},
        "target": {"dialect": "duckdb", "name": example["function"],
                   "sql": query.sql(dialect="duckdb", pretty=True, max_text_width=80, unsupported_level=ErrorLevel.RAISE) + ";"},
        "formatTokens": tokens,
        "executionVerified": False,
        "provenance": {"name": "SQLGlot", "commit": commit,
                       "url": f"https://github.com/tobymao/sqlglot/blob/{commit}/sqlglot/dialects/{dialect}.py"},
    })

# Fixture pairs already contain both dialects' SQL. Preserve those strings,
# including whole-query rewrites, instead of assuming a one-to-one function alias.
candidates = defaultdict(list)
for fixture in audit["fixtures"]:
    if fixture["targetDialect"] != "duckdb" or fixture["expectedUnsupported"] or not fixture["sourceDialect"]:
        continue
    for name in fixture["duckdbFunctionsCalled"]:
        candidates[name, fixture["sourceDialect"]].append(fixture)

seeded = {(row["function"], row["source"]["dialect"]) for row in data}
for (name, dialect), fixtures in sorted(candidates.items()):
    if (name, dialect) in seeded:
        continue
    # Favor focused examples, then shorter SQL; stable ties keep capture reproducible.
    fixture = min(fixtures, key=lambda row: (
        relation(name, row["expectedSql"]) != "direct",
        len(row["duckdbFunctionsCalled"]),
        len(row["sourceSql"]) + len(row["expectedSql"]), row["test"], row["sourceSql"],
    ))
    names = called_names(fixture["sourceSql"], dialect)
    data.append({
        "function": name, "scope": "", "relation": relation(name, fixture["expectedSql"]),
        "source": {"engine": engine_labels[dialect], "dialect": dialect,
                   "name": names[0] if len(names) == 1 else "", "names": names, "sql": fixture["sourceSql"]},
        "target": {"dialect": "duckdb", "name": name, "sql": fixture["expectedSql"]},
        "formatTokens": [], "executionVerified": False,
        "provenance": {"name": "SQLGlot", "commit": commit, "url": fixture["test"]},
    })

data.sort(key=lambda row: (row["function"], row["source"]["dialect"] != "postgres", row["source"]["engine"]))
output = Path(__file__).resolve().parents[2] / "src/haybarn-functions/data/translations.json"
output.write_text(json.dumps(data, indent=2) + "\n")
print(f"Wrote {len(data)} examples for {len({row['function'] for row in data})} functions across "
      f"{len({row['source']['dialect'] for row in data})} dialects to {output}")
