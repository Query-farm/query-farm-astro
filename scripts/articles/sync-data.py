#!/usr/bin/env python3
"""Export visible input data and downloadable fixtures from the actual tutorial SQL.
Run with: uv run --with duckdb==2.0.0 python scripts/articles/sync-data.py
"""
import json, os, pathlib, tempfile
import duckdb
ROOT=pathlib.Path(__file__).resolve().parents[2]
TABLES={
 'fuzzy-matching-duckdb':[
  ('leads','Incoming CRM export','Seven records to match. IDs identify source records; country is the recorded country code.',None),
  ('customers','Customer reference','Nine existing customers. Notice the two Cedar Works IDs and the two countries for North Star Tools.',None),
 ],
 'compare-parquet-duckdb':[
  ('previous_snapshot','Yesterday · previous','All five rows. NULL means the customer exists, but their plan is unknown.',None),
  ('current_snapshot','Today · current','All five rows. The row count stayed the same; the customers did not.',None),
 ],
 'duckdb-postgresql-query-pushdown':[
  ('orders','The orders table','First eight of 10,000 generated orders. Amount is an integer in this fixture, with no currency implied.',8),
 ],
}
for slug,table_specs in TABLES.items():
 path=ROOT/'src/data/tutorials'/f'{slug}.json';data=json.loads(path.read_text())
 with tempfile.TemporaryDirectory(prefix='qf-visible-data-') as tmp:
  old=pathlib.Path.cwd();os.chdir(tmp)
  try:
   c=duckdb.connect()
   if data['extension']=='rapidfuzz':
    c.execute("SET allow_extension_repositories='allowed'; CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm'; INSTALL rapidfuzz FROM query_farm; LOAD rapidfuzz FROM query_farm;")
   c.execute(data['setup']);previews=[]
   for table,title,description,limit in table_specs:
    result=c.execute(f'SELECT * FROM {table} ORDER BY id')
    columns=[x[0] for x in result.description];rows=[list(x) for x in result.fetchall()]
    public=ROOT/'public/media/posts'/slug
    c.execute(f"COPY (SELECT * FROM {table} ORDER BY id) TO '{public / (table+'.csv')}' (FORMAT CSV, HEADER)")
    downloads=[{'label':'CSV','file':table+'.csv'}]
    if slug=='compare-parquet-duckdb':
     c.execute(f"COPY (SELECT * FROM {table} ORDER BY id) TO '{public / (table+'.parquet')}' (FORMAT PARQUET)")
     downloads.append({'label':'Parquet','file':table+'.parquet'})
    previews.append({'table':table,'title':title,'description':description,'columns':columns,'rows':rows[:limit] if limit else rows,'totalRows':len(rows),'downloads':downloads})
   data['sampleTables']=previews
   path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');c.close()
  finally:os.chdir(old)
 print(slug)
