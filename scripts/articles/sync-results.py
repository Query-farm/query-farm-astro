#!/usr/bin/env python3
"""Capture result columns and readable plan excerpts beside the checked fixtures.
Run: uv run --with duckdb==2.0.0 python scripts/articles/sync-results.py
"""
import json, os, pathlib, re, tempfile
import duckdb
ROOT = pathlib.Path(__file__).resolve().parents[2]


def plan_excerpt(plan, omit_projections=False):
    """Reformat captured operators, removing runtime timings, never inventing rows."""
    blocks = []
    for block in re.findall(r'╭─[^\n]+\n(?:│[^\n]*\n)+╰[^\n]*', plan):
        lines = block.splitlines()
        name = re.split(r'[\u2500-\u257f]', lines[0][3:])[0].strip()
        if name == 'Summary' or (omit_projections and name == 'Projection'):
            continue
        fields = [line.strip('│ ').rstrip() for line in lines[1:-1]]
        fields = [re.sub(r'\s+\d+(?:\.\d+)?(?:µs|ms|ns|s)$', '', field) for field in fields]
        blocks.append(name + '\n' + '\n'.join('  ' + field for field in fields))
    assert blocks, 'No captured plan operators found'
    return '\n\n'.join(blocks)


def sync():
    for source in sorted((ROOT / 'src/data/tutorials').glob('*.json')):
        data = json.loads(source.read_text())
        if data.get('batch') == 'next-ten': continue  # Captured by capture-next.py.
        with tempfile.TemporaryDirectory(prefix='qf-result-capture-') as tmp:
            previous = pathlib.Path.cwd()
            try:
                os.chdir(tmp)
                connection = duckdb.connect()
                if data['extension'] == 'rapidfuzz':
                    connection.execute("SET allow_extension_repositories='allowed'; CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm'; INSTALL rapidfuzz FROM query_farm; LOAD rapidfuzz FROM query_farm;")
                connection.execute(data['setup'])
                for example in data['examples']:
                    result = connection.execute(example['sql'])
                    columns = [column[0] for column in result.description]
                    rows = [list(row) for row in result.fetchall()]
                    if 'expectedRows' in example:
                        assert rows == example['expectedRows'], (data['slug'], example['id'], rows)
                        example['expectedColumns'] = columns
                    else:
                        assert example['id'] == 'local-plan'
                        example['planExcerpt'] = plan_excerpt(rows[0][1], omit_projections=True)
                if data['slug'] == 'duckdb-postgresql-query-pushdown':
                    evidence = json.loads((ROOT / 'public/media/posts' / data['slug'] / 'evidence.json').read_text())
                    data['nativeResults'] = {}
                    for name, case in evidence['cases'].items():
                        # Verify captured PostgreSQL answers against the same local fixture.
                        sql = re.sub(r'pg(?:_local)?\.public\.orders', 'orders', case['sql'])
                        result = connection.execute(sql)
                        columns = [column[0] for column in result.description]
                        rows = [list(row) for row in result.fetchall()]
                        assert rows == case['rows'], name
                        data['nativeResults'][name] = {'columns': columns, 'rows': case['rows'], 'planExcerpt': plan_excerpt(case['plan'])}
                connection.close()
                source.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
            finally:
                os.chdir(previous)
        print(data['slug'])


if __name__ == '__main__':
    sync()
