#!/usr/bin/env python3
"""Capture/verify a tutorial batch with real DuckDB 2.0.0.
uv run --with duckdb==2.0.0 python scripts/articles/capture-next.py [--batch=next-ten|practical-ten] [--check]
"""
import datetime, decimal, json, os, pathlib, re, sys, tempfile
import duckdb
ROOT=pathlib.Path(__file__).resolve().parents[2]
CHECK='--check' in sys.argv
BATCH=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--batch=')), 'next-ten')

def cell(v):
 if isinstance(v,decimal.Decimal):return float(v)
 if isinstance(v,(datetime.date,datetime.datetime)):return str(v)
 if isinstance(v,dict):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
 return v

def rows(c,sql):
 result=c.execute(sql)
 return [x[0] for x in result.description],[[cell(v) for v in row] for row in result.fetchall()]

def install(c,extension):
 if extension!='DuckDB':
  c.execute("SET allow_extension_repositories='allowed'; CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';")
  c.execute(f'INSTALL {extension} FROM query_farm; LOAD {extension} FROM query_farm;')

def nodes(plan):
 if isinstance(plan,list):
  for node in plan:yield from nodes(node)
 else:
  name=plan.get('operator_name',plan.get('name',plan.get('type')))
  if name:yield plan
  for child in plan.get('children',plan.get('operator',[])):yield from nodes(child)

def facts(plan):
 return [dict(name=n.get('operator_name',n.get('name',n.get('type'))).strip(),rows=n.get('operator_cardinality',n.get('intermediate_rows')),extra={k:v for k,v in n.get('extra_info',{}).items() if k!='Dynamic Filters'}) for n in nodes(plan)]

def excerpt(plan,analyze):
 blocks=[]
 if analyze:
  blocks.append('Recorded query total time: '+f"{plan['query']['total_time']*1000:.3f} ms")
 for node in nodes(plan):
  name=node.get('operator_name',node.get('name',node.get('type'))).strip()
  if name in ['PROJECTION','EXPLAIN_ANALYZE','QUERY','RESULT_COLLECTOR']:continue
  info=node.get('extra_info',{})
  lines=[name]
  for key in ['Table','Type','Join Type','Conditions','Filters','Groups','Aggregates','Order By','Estimated Cardinality']:
   if key in info:
    value=info[key];value=', '.join(map(str,value)) if isinstance(value,list) else str(value)
    lines.append(f'  {key}: {value}')
  if analyze:
   lines.append(f"  Actual output rows: {node['intermediate_rows']:,}")
   lines.append(f"  Operator time: {node['timing']*1000:.3f} ms")
  blocks.append('\n'.join(lines))
 return '\n\n'.join(blocks)

def export_sql(c,path,query,fmt):
 c.execute(f"COPY ({query}) TO '{path}' (FORMAT {fmt}"+(', HEADER' if fmt=='CSV' else '')+')')

def verify_download(c,path,query):
 if path.suffix=='.csv':
  # Compare text representations so a CSV reader cannot silently coerce an
  # all-text source (e.g. "pending" amounts) into a different schema.
  columns=[x[0] for x in c.execute(query).description]
  types=', '.join("'"+name.replace("'","''")+"':'VARCHAR'" for name in columns)
  actual=c.execute(f"SELECT * FROM read_csv(?, header=true, columns={{{types}}})",[str(path)]).fetchall()
  names=', '.join('CAST("'+name.replace('"','""')+'" AS VARCHAR)' for name in columns)
  expected=c.execute(f'SELECT {names} FROM ({query})').fetchall()
 else:
  actual=c.execute('SELECT * FROM read_parquet(?) ORDER BY id',[str(path)]).fetchall()
  expected=c.execute(query).fetchall()
 assert actual==expected,(path,'Download differs from input')

results=[]
for source in sorted((ROOT/'src/data/tutorials').glob('*.json')):
 data=json.loads(source.read_text())
 if data.get('batch')!=BATCH:continue
 public=ROOT/'public/media/posts'/data['slug']
 if not CHECK:public.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='qf-tutorial-capture-') as tmp:
  old=os.getcwd();os.chdir(tmp)
  try:
   c=duckdb.connect();install(c,data['extension']);c.execute(data['setup'])
   if data['slug']=='duckdb-json-schema-validation':
    contract=json.loads(c.execute('SELECT definition FROM contract').fetchone()[0])
    if CHECK:
     assert data['contract']==contract
     assert json.loads((public/'schema.json').read_text())==contract
    else:
     data['contract']=contract
     (public/'schema.json').write_text(json.dumps(contract,indent=2)+'\n')
   samples=[]
   for spec in data['sampleSpecs']:
    query=f"SELECT * FROM {spec['table']} ORDER BY id"
    columns,values=rows(c,query)
    filename=spec['table']+'.csv'
    if not CHECK:export_sql(c,public/filename,query,'CSV')
    verify_download(c,public/filename,query)
    preview=rows(c,spec['previewQuery'])[1] if spec.get('previewQuery') else values[:spec.get('previewLimit')] if spec.get('previewLimit') else values
    samples.append(dict(table=spec['table'],title=spec['title'],description=spec['description'],columns=columns,rows=preview,totalRows=len(values),downloads=[dict(label='CSV',file=filename)]))
   if CHECK:assert samples==data['sampleTables'],data['slug']
   else:data['sampleTables']=samples
   for filename in data.get('files',[]):
    path=pathlib.Path(filename)
    if not CHECK:(public/filename).write_bytes(path.read_bytes())
    table='early_export' if 'early' in filename else 'later_export'
    verify_download(c,public/filename,f'SELECT * FROM {table} ORDER BY id')
   if data['slug']=='duckdb-parquet-metadata':
    for layout in ['sorted','mixed']:
     path=c.execute(f"SELECT getvariable('{layout}_file')").fetchone()[0]
     if not CHECK:(public/f'{layout}.parquet').write_bytes(pathlib.Path(path).read_bytes())
     verify_download(c,public/f'{layout}.parquet','SELECT * FROM events ORDER BY id')
   evidence={}
   for example in data['examples']:
    columns,values=rows(c,example['sql'])
    if example.get('plan'):
     analyze=example['sql'].startswith('EXPLAIN ANALYZE')
     base=re.sub(r'^EXPLAIN(?: ANALYZE)?\s*','',example['sql'])
     sql=('EXPLAIN (ANALYZE, FORMAT JSON) ' if analyze else 'EXPLAIN (FORMAT JSON) ')+base
     plan=json.loads(c.execute(sql).fetchone()[1])
     if CHECK:
      assert facts(plan)==example['planFacts'],(data['slug'],example['id'],'Plan facts changed')
      saved=json.loads((public/'plans.json').read_text())[example['id']]
      assert excerpt(saved,analyze)==example['planExcerpt']
      assert facts(saved)==example['planFacts']
     else:
      evidence[example['id']]=plan
      example.update(planFacts=facts(plan),planExcerpt=excerpt(plan,analyze),planLabel='Captured '+('execution profile' if analyze else 'physical plan')+' · selected operators',planNote='Captured with native DuckDB 2.0.0 on these fixtures. Projection/internal operators omitted; browser formatting can differ.'+(' Timings are one recorded run, not a benchmark.' if analyze else ' Cardinalities are estimates; this statement did not execute the SELECT.'))
    elif CHECK:
     assert columns==example['expectedColumns'],(data['slug'],example['id'],columns)
     assert values==example['expectedRows'],(data['slug'],example['id'],values)
    else:example.update(expectedColumns=columns,expectedRows=values)
    results.append(dict(slug=data['slug'],example=example['id'],status='passed'))
   ch=data['challenge'];columns,values=rows(c,ch['solution'])
   if CHECK:assert columns==ch['columns'] and values==ch['rows'],(data['slug'],'Challenge changed')
   else:ch.update(columns=columns,rows=values)
   starter_columns,starter_values=rows(c,ch['starter'])
   assert (starter_columns,starter_values)!=(columns,values),(data['slug'],'Starter already passes')
   if not CHECK:
    prefix=''
    if data['extension']!='DuckDB':
     ext=data['extension'];prefix=f"-- DuckDB 2.0: install once, then load for the session.\nSET allow_extension_repositories='allowed';\nCREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';\nINSTALL {ext} FROM query_farm;\nLOAD {ext} FROM query_farm;\n\n"
    (public/'setup.sql').write_text(prefix+data['setup'])
    (public/'walkthrough.sql').write_text(prefix+data['setup']+'\n\n'+'\n\n'.join('-- '+e['title']+'\n'+e['sql'] for e in data['examples'])+'\n\n-- Challenge: '+ch['prompt']+'\n'+ch['starter']+'\n\n-- One solution\n'+ch['solution']+'\n')
    if evidence:(public/'plans.json').write_text(json.dumps(evidence,indent=2)+'\n')
    source.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
   print(data['slug']+': '+str(len(data['examples']))+' queries, input downloads and challenge verified',flush=True)
   c.close()
  finally:os.chdir(old)
pathlib.Path(f'/tmp/query-farm-articles-review/{BATCH}-native-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(str(len(results))+' example queries and '+str(len(set(r['slug'] for r in results)))+' challenge solutions passed.')
