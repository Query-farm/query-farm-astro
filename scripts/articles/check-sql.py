#!/usr/bin/env python3
"""Verify the tutorial fixtures and exact expected results using native DuckDB.
Run: uv run --with duckdb==2.0.0 python scripts/articles/check-sql.py
"""
import json, os, pathlib, tempfile, re
from runpy import run_path
import duckdb
ROOT = pathlib.Path(__file__).resolve().parents[2]
plan_excerpt = run_path(str(ROOT / 'scripts/articles/sync-results.py'))['plan_excerpt']
results = []
for source in sorted((ROOT / 'src/data/tutorials').glob('*.json')):
 data = json.loads(source.read_text())
 if data.get('batch') == 'next-ten': continue  # Verified by capture-next.py --check.
 with tempfile.TemporaryDirectory(prefix='qf-article-sql-') as tmp:
  previous = pathlib.Path.cwd()
  try:
   os.chdir(tmp)
   connection = duckdb.connect()
   if data['extension'] == 'rapidfuzz':
    connection.execute("SET allow_extension_repositories='allowed'; CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm'; INSTALL rapidfuzz FROM query_farm; LOAD rapidfuzz FROM query_farm;")
   connection.execute(data['setup'])
   for sample in data['sampleTables']:
    query=f"SELECT * FROM {sample['table']} ORDER BY id"
    result=connection.execute(query)
    assert [c[0] for c in result.description]==sample['columns']
    rows=[list(row) for row in result.fetchall()]
    assert len(rows)==sample['totalRows']
    assert rows[:len(sample['rows'])]==sample['rows']
    for download in sample['downloads']:
     path=ROOT/'public/media/posts'/data['slug']/download['file']
     reader='read_parquet' if path.suffix=='.parquet' else 'read_csv_auto'
     exported=[list(row) for row in connection.execute(f"SELECT * FROM {reader}(?) ORDER BY id",[str(path)]).fetchall()]
     assert exported==rows,(path,'Download differs from executable fixture')
   for example in data['examples']:
    result = connection.execute(example['sql'])
    columns = [column[0] for column in result.description]
    rows = [list(row) for row in result.fetchall()]
    if 'expectedRows' in example:
     assert columns == example['expectedColumns'], (data['slug'],example['id'],columns)
     assert rows == example['expectedRows'], (data['slug'],example['id'],rows)
    else:
     assert example['id'] == 'local-plan'
     assert '8,000 rows' in rows[0][1] and 'Group By' in rows[0][1]
     assert example['planExcerpt'] == plan_excerpt(rows[0][1], omit_projections=True)
    results.append({'article':data['slug'],'example':example['id'],'status':'passed'})
   if data['slug']=='duckdb-postgresql-query-pushdown':
    evidence=json.loads((ROOT/'public/media/posts'/data['slug']/'evidence.json').read_text())
    for name,case in evidence['cases'].items():
     shown=data['nativeResults'][name]
     result=connection.execute(re.sub(r'pg(?:_local)?\.public\.orders','orders',case['sql']))
     assert [col[0] for col in result.description]==shown['columns']
     assert [list(row) for row in result.fetchall()]==shown['rows']==case['rows']
     assert shown['planExcerpt']==plan_excerpt(case['plan'])

    cancelled=connection.execute(data['examples'][0]['sql'].replace("'paid'","'cancelled'")).fetchall()
    assert cancelled==[('East',20500),('North',25500),('South',28000),('West',23000)]
   if data['extension']=='rapidfuzz':
    edited=data['examples'][2]['sql'].replace('score < 85','score < 65')
    rows=connection.execute(edited).fetchall()
    assert next(row for row in rows if row[0]==103)[-1]=='suggested match'
    assert next(row for row in rows if row[0]==105)[-1]=='review: close scores'
    rows=connection.execute(edited.replace('runner_up < 10','runner_up < 0')).fetchall()
    assert next(row for row in rows if row[0]==105)[-1]=='suggested match'
    assert connection.execute("SELECT round(rapidfuzz_token_sort_ratio(name_key('tools ACME'),name_key('Acme Toolco')),1)").fetchone()[0]==85.7
    duplicates=connection.execute("SELECT a.id,b.id FROM customers a JOIN customers b ON a.country=b.country AND a.id<b.id WHERE rapidfuzz_token_sort_ratio(name_key(a.name),name_key(b.name))>=95").fetchall()
    assert duplicates==[(7,9)],duplicates
    connection.execute("INSERT INTO leads VALUES (108,NULL,'US'),(109,'   ','US')")
    assert connection.execute('SELECT count(*) FROM candidates WHERE lead_id IN (108,109)').fetchone()[0]==0
    assert all(row[-1]=='no candidates' for row in connection.execute(data['examples'][2]['sql']).fetchall() if row[0] in (108,109))
   if data['slug']=='compare-parquet-duckdb':
    connection.execute("CREATE OR REPLACE VIEW current AS SELECT * REPLACE ('pro' AS plan) FROM current_snapshot")
    changed=connection.execute(data['examples'][1]['sql']).fetchall()
    assert [row[0] for row in changed]==[1,2,3,4,5,6],changed
    connection.execute("CREATE OR REPLACE VIEW current AS SELECT * FROM current_snapshot")
    # Reordering source records must not change the diff. NULL keys and
    # duplicate keys must be rejected by the documented preflight query.
    baseline=connection.execute(data['examples'][1]['sql']).fetchall()
    connection.execute("CREATE OR REPLACE VIEW current AS SELECT * FROM current_snapshot ORDER BY id DESC")
    assert connection.execute(data['examples'][1]['sql']).fetchall()==baseline
    connection.execute("INSERT INTO current_snapshot VALUES (NULL,'No key','free'),(1,'Duplicate','pro')")
    bad=connection.execute(data['examples'][0]['sql']).fetchall()
    assert set(bad)=={('current',None,1),('current',1,2)},bad
   connection.close()
  finally: os.chdir(previous)
output = pathlib.Path('/tmp/query-farm-articles-review/native-results.json')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'duckdb':duckdb.__version__,'examples':results},indent=2)+'\n')
print(f'{len(results)} examples passed; visible inputs and outputs, captured plans, downloads, reader experiments, duplicate, NULL-key, and row-order checks passed.')
