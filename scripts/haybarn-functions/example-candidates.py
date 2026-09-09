"""Preserve catalog SQL and add small input tables for examples with free columns."""
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.cache/sqlglot').resolve()))
from sqlglot import exp, parse_one

version = json.loads(Path('package.json').read_text())['dependencies']['@haybarn/haybarn-wasm']
snapshot = json.loads(Path(f'src/haybarn-functions/data/snapshots/haybarn-{version}.json').read_text())


def value(type, second=False):
    type = type or 'ANY'
    if type.endswith('[]'):
        return '[' + value(type[:-2], second) + ', NULL]'
    if type.startswith(('VARCHAR', 'CHAR')): return "'pears'" if second else "'apples'"
    if type == 'BOOLEAN': return 'FALSE' if second else 'TRUE'
    if type == 'DATE': return "DATE '2026-07-01'" if second else "DATE '2026-06-01'"
    if type.startswith('TIMESTAMP'): return "TIMESTAMP '2026-06-03 14:30:00'" if second else "TIMESTAMP '2026-06-03 12:00:00'"
    if type.startswith('TIME'): return "TIME '14:30:00'" if second else "TIME '12:00:00'"
    if type == 'INTERVAL': return "INTERVAL '2 days'" if second else "INTERVAL '1 day'"
    if type == 'BLOB': return "'pear'::BLOB" if second else "'apple'::BLOB"
    if type == 'JSON': return "'{\"value\":2}'::JSON" if second else "'{\"value\":1}'::JSON"
    if type.startswith('MAP'): return "MAP {'fruit': 10}"
    if type.startswith('STRUCT'): return "{'fruit': 'apples'}"
    return '20' if second else '10'


def wrap(text, kind):
    if re.match(r'^\s*(SELECT|WITH|FROM|CALL|PRAGMA|CREATE|INSTALL|LOAD)\b', text, re.I): return text
    return ('SELECT * FROM ' if kind in ('table', 'table_macro') else 'SELECT ') + text.rstrip(';') + ';'


candidates, seen = [], set()
for row in snapshot['functions']:
    for original in row['examples']:
        sql = wrap(original, row['function_type'])
        key = row['function_name'], sql
        if key in seen: continue
        seen.add(key)
        base = {'function': row['function_name'], 'original': original, 'sql': sql, 'source': 'engine-catalog'}
        candidates.append(base)
        try:
            query = parse_one(sql, read='duckdb')
        except Exception:
            continue
        if not isinstance(query, exp.Select) or query.args.get('from_'): continue
        columns = {column.name: column for column in query.find_all(exp.Column)}
        if not columns: continue
        types = {}
        for call in query.find_all(exp.Func):
            if not re.match(rf'^{re.escape(row["function_name"])}\s*\(', call.sql('duckdb'), re.I): continue
            for index, argument in enumerate(call.iter_expressions()):
                for column in argument.find_all(exp.Column):
                    types.setdefault(column.name, row['parameter_types'][index] if index < len(row['parameter_types']) else row['varargs'])
        ordered = sorted(columns)
        inputs = [[value(types.get(name), second) for name in ordered] for second in (False, True)]
        inputs.append(['NULL'] * len(ordered))
        rows = ',\n  '.join('(' + ', '.join(values) + ')' for values in inputs)
        labels = ', '.join('"' + name.replace('"', '""') + '"' for name in ordered)
        adapted = sql.rstrip(';') + f'\nFROM (VALUES\n  {rows}\n) AS sample({labels});'
        candidates.append({**base, 'sql': adapted, 'source': 'catalog-with-sample-data'})

extra = json.loads(Path('scripts/haybarn-functions/example-setups.json').read_text())
for name, sql in extra.items():
    candidates.append({'function': name, 'original': None, 'sql': sql, 'source': 'guide-example'})
Path('.cache/example-candidates.json').write_text(json.dumps(candidates, indent=2) + '\n')
print(f'{len(candidates)} candidate examples for {len({row["function"] for row in candidates})} functions.')
