"""Inspect a SQLGlot checkout without treating successful generation as engine support.

Run: python3 scripts/haybarn-functions/audit-sqlglot.py --repo .cache/sqlglot
This research tool does not participate in the Astro build or change catalog data.
"""

import argparse
import ast
from collections import Counter
import inspect
import json
from pathlib import Path
import sqlite3
import subprocess
import sys


def main():
    version = json.loads(Path("package.json").read_text())["dependencies"]["@haybarn/haybarn-wasm"]
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--repo", type=Path, required=True)
    arguments.add_argument("--snapshot", type=Path, default=Path(f"src/haybarn-functions/data/snapshots/haybarn-{version}.json"))
    arguments.add_argument("--output", type=Path, default=Path(".cache/sqlglot-audit.json"))
    options = arguments.parse_args()
    repo = options.repo.resolve()
    sys.path.insert(0, str(repo))
    import sqlglot
    from sqlglot import exp
    from sqlglot.dialects import Dialect
    from sqlglot.errors import ErrorLevel
    from sqlglot.tokens import TokenType

    assert Path(sqlglot.__file__).resolve().is_relative_to(repo)
    revision = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    snapshot = json.loads(options.snapshot.read_text())
    names = {row["function_name"] for row in snapshot["functions"]}
    duckdb = Dialect.get_or_raise("duckdb")
    registered = set(duckdb.parser_class.FUNCTIONS) | set(duckdb.parser_class.FUNCTION_PARSERS)
    recognized = sorted(name for name in names if name.upper() in registered)

    def reference(path, line):
        return f"https://github.com/tobymao/sqlglot/blob/{revision}/{path}#L{line}"

    def explicitly_called(sql):
        try:
            tokens = duckdb.tokenize(sql)
            return sorted({token.text.lower() for token, next_token in zip(tokens, tokens[1:])
                           if next_token.token_type == TokenType.L_PAREN and token.text.lower() in names})
        except sqlglot.errors.SqlglotError:
            return []

    # Literal validate_all fixtures retain direction. A read mapping is the
    # opposite of a write mapping; a successful reverse rewrite is not assumed.
    fixture_pairs = []
    for path in sorted((repo / "tests/dialects").glob("test_*.py")):
        tree = ast.parse(path.read_text())
        for cls in (node for node in tree.body if isinstance(node, ast.ClassDef)):
            dialect = next((node.value.value for node in cls.body if isinstance(node, ast.Assign)
                            and any(isinstance(target, ast.Name) and target.id == "dialect" for target in node.targets)
                            and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)), None)
            if not dialect:
                continue
            for call in (node for node in ast.walk(cls) if isinstance(node, ast.Call)
                         and isinstance(node.func, ast.Attribute) and node.func.attr == "validate_all"):
                if not call.args or not isinstance(call.args[0], ast.Constant) or not isinstance(call.args[0].value, str):
                    continue
                base_sql = call.args[0].value
                for keyword in call.keywords:
                    if keyword.arg not in ("read", "write") or not isinstance(keyword.value, ast.Dict):
                        continue
                    for key, value in zip(keyword.value.keys, keyword.value.values):
                        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                            continue
                        other = key.value
                        if "duckdb" not in (dialect, other) or dialect == other:
                            continue
                        is_sql = isinstance(value, ast.Constant) and isinstance(value.value, str)
                        unsupported = isinstance(value, ast.Name) and value.id == "UnsupportedError"
                        if not (is_sql or unsupported):
                            continue
                        source, target = (dialect, other) if keyword.arg == "write" else (other, dialect)
                        source_sql, target_sql = (base_sql, value.value if is_sql else None) if keyword.arg == "write" else (value.value if is_sql else None, base_sql)
                        duckdb_sql = source_sql if source == "duckdb" else target_sql
                        fixture_pairs.append({"sourceDialect": source, "targetDialect": target,
                                              "sourceSql": source_sql, "expectedSql": target_sql,
                                              "expectedUnsupported": unsupported,
                                              "duckdbFunctionsCalled": explicitly_called(duckdb_sql or ""),
                                              "test": reference(path.relative_to(repo), call.lineno),
                                              "executionVerified": False})

    queries = [
        "SELECT list_transform([1, 2, 3], x -> x * 2)",
        "SELECT string_split('a,b', ',')",
        "SELECT strftime(x, '%Y-%m-%d') FROM t",
        "SELECT date_diff('day', start_date, end_date) FROM t",
        "SELECT quantile_cont(x, 0.5) FROM t",
        "SELECT concat(a, b) FROM t",
        "SELECT regexp_extract('abc123', '(\\d+)', 1)",
        "SELECT epoch_ms(1704067200000)",
        "SELECT epoch_ms(TIMESTAMP '2024-01-01 00:00:00')",
        "SELECT * FROM read_csv('a.csv', header := true)",
        "SELECT made_up_function(1)",
    ]
    dialects = ["postgres", "bigquery", "snowflake", "spark", "trino", "mysql", "sqlite"]
    probes = []
    for query in queries:
        expression = sqlglot.parse_one(query, read="duckdb")
        classes = sorted({type(node) for node in expression.walk() if isinstance(node, exp.Func)}, key=lambda cls: cls.__name__)
        outputs = []
        for dialect in dialects:
            generator = Dialect.get_or_raise(dialect).generator(unsupported_level=ErrorLevel.RAISE)
            handlers = []
            for cls in classes:
                handler = generator._dispatch.get(cls)
                path = inspect.getsourcefile(handler) if handler else None
                line = inspect.getsourcelines(handler)[1] if path else None
                handlers.append({"expression": cls.__name__, "source": reference(Path(path).relative_to(repo), line) if path else None,
                                 "usesGenericFunctionFallback": handler is None})
            output = {"dialect": dialect, "handlers": handlers, "executionVerified": False}
            try:
                output["sql"] = generator.generate(expression.copy())
                output["status"] = "generated-not-verified"
            except sqlglot.errors.UnsupportedError as error:
                output.update(status="explicitly-unsupported", message=str(error))
            if dialect == "sqlite" and query in (queries[6], queries[-1]):
                with sqlite3.connect(":memory:") as connection:
                    try:
                        output["sqliteResult"] = connection.execute(output["sql"]).fetchall()
                    except sqlite3.Error as error:
                        output["sqliteError"] = str(error)
            outputs.append(output)
        probes.append({"sourceSql": query, "expressionClasses": [cls.__name__ for cls in classes], "targets": outputs})

    tested_names = sorted({name for pair in fixture_pairs for name in pair["duckdbFunctionsCalled"]})
    summary = {"catalogFunctions": len(names), "parserRegisteredNameMatches": len(recognized),
               "literalDirectionalFixturesInvolvingDuckdb": len(fixture_pairs),
               "catalogNamesExplicitlyCalledInFixtures": len(tested_names),
               "fixturesByDirection": dict(Counter("from-duckdb" if pair["sourceDialect"] == "duckdb" else "to-duckdb" for pair in fixture_pairs)),
               "fixturesExpectingUnsupported": sum(pair["expectedUnsupported"] for pair in fixture_pairs)}
    report = {"sqlglot": {"repository": "https://github.com/tobymao/sqlglot", "commit": revision, "license": "MIT"},
              "snapshot": snapshot["id"], "summary": summary,
              "interpretation": ["Parser registration is not engine capability or compatibility evidence.",
                                 "Fixtures test generated SQL strings, not execution equivalence; some deliberately ignore unsupported warnings.",
                                 "Function-name matches exclude operators and no-parentheses calls and do not establish overload coverage.",
                                 "Generation can silently use generic fallbacks even for recognized expression classes and with ErrorLevel.RAISE.",
                                 "No functions are automatically labeled compatible by this report."],
              "parserRegisteredNames": recognized, "catalogNamesCalledInFixtures": tested_names,
              "probes": probes, "fixtures": fixture_pairs}
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    print(f"Evidence written to {options.output}")


if __name__ == "__main__":
    main()
