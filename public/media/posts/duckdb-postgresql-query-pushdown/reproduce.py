#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["duckdb==2.0.0", "adbc-driver-postgresql==1.13.0"]
# ///
"""Reproduce the article in a disposable local PostgreSQL cluster.
Requires PostgreSQL server tools and uv. Run as a non-root user:
uv run --python 3.12 reproduce.py [--sql query.sql]
Writes evidence.json; never connects to an existing database.
"""
import argparse, importlib.metadata, json, os, pathlib, platform, re, shutil, socket, subprocess, tempfile
import adbc_driver_postgresql, duckdb
FIXTURE = """CREATE TABLE orders AS
SELECT i AS id,
       CASE i % 4 WHEN 0 THEN 'East' WHEN 1 THEN 'West'
         WHEN 2 THEN 'North' ELSE 'South' END AS region,
       (i % 100 + 1)::INTEGER AS amount,
       CASE WHEN i % 5 = 0 THEN 'cancelled' ELSE 'paid' END AS status
FROM generate_series(1, 10000) AS s(i);"""
QUERIES = {
 'aggregate': "SELECT region, sum(amount) AS total FROM pg.public.orders WHERE status = 'paid' GROUP BY region ORDER BY region;",
 'filter': "SELECT id, amount FROM pg.public.orders WHERE status = 'paid' AND id <= 5 ORDER BY id;",
 'function': "SELECT region, sum(length(status)) AS label_chars FROM pg.public.orders GROUP BY region ORDER BY region;",
 'local_control': "SELECT region, sum(amount) AS total FROM pg_local.public.orders WHERE status = 'paid' GROUP BY region ORDER BY region;",
}
def command(*args):
 try:
  return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)
 except subprocess.CalledProcessError as error:
  raise RuntimeError(f'{pathlib.Path(args[0]).name} failed:\n{error.output}') from error
def postgres_tools():
 # pg_config locates the matching server tools on Linux and keg-only Homebrew
 # installs. No system service is started or existing database contacted.
 config = shutil.which('pg_config')
 bindir = pathlib.Path(command(config, '--bindir').strip()) if config else None
 tools = {}
 for name in ('initdb', 'pg_ctl', 'psql'):
  candidate = bindir / name if bindir else None
  tools[name] = str(candidate) if candidate and os.access(candidate, os.X_OK) else shutil.which(name)
 if not all(tools.values()):
  raise SystemExit('PostgreSQL server tools are missing. Install PostgreSQL and add its bin directory to PATH (see First run in the tutorial). No running server is needed.')
 if hasattr(os, 'geteuid') and os.geteuid() == 0:
  raise SystemExit('Run this lab as your normal user, not root; PostgreSQL initdb requires it.')
 return tools
def main():
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--sql', type=pathlib.Path, help='Run a SQL file against the ready pg and pg_local attachments after the checks.')
 args = parser.parse_args()
 custom_sql = args.sql.read_text() if args.sql else None
 tools = postgres_tools()
 with tempfile.TemporaryDirectory(prefix='qf-pushdown-') as tmp:
  work = pathlib.Path(tmp)
  with socket.socket() as sock:
   sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
  data = str(work / 'data')
  command(tools['initdb'], '-D', data, '-A', 'trust', '-U', 'article_demo', '--encoding=UTF8', '--no-locale')
  connection = None
  try:
   command(tools['pg_ctl'], '-D', data, '-l', str(work / 'postgres.log'), '-o',
     f'-h 127.0.0.1 -p {port} -k {tmp} -c log_statement=all', '-w', 'start')
   uri = f'postgresql://article_demo@127.0.0.1:{port}/postgres'
   command(tools['psql'], uri, '-X', '-v', 'ON_ERROR_STOP=1', '-c', FIXTURE)
   connection = duckdb.connect()
   connection.execute("SET allow_extension_repositories = 'allowed'")
   connection.execute("CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm'")
   connection.execute('INSTALL adbc_scanner FROM query_farm')
   connection.execute('LOAD adbc_scanner FROM query_farm')
   driver = adbc_driver_postgresql._driver_path().replace("'", "''")
   for alias, option in [('pg', ''), ('pg_local', ', query_pushdown false')]:
    connection.execute(f"ATTACH '{uri}' AS {alias} (TYPE adbc, driver '{driver}', READ_ONLY{option})")
   result = {
    'duckdb': duckdb.__version__,
    'postgresql': command(tools['psql'], uri, '-X', '-At', '-c', 'SHOW server_version').strip(),
    'adbc_driver_postgresql': importlib.metadata.version('adbc-driver-postgresql'),
    'extension_version': connection.execute("SELECT extension_version FROM duckdb_extensions() WHERE extension_name='adbc_scanner'").fetchone()[0],
    'platform': platform.system() + ' ' + platform.machine(),
    'fixture_rows': 10000, 'fixture_sql': FIXTURE, 'cases': {},
   }
   for name, sql in QUERIES.items():
    rows = [list(row) for row in connection.execute(sql).fetchall()]
    plan = connection.execute('EXPLAIN ANALYZE ' + sql).fetchone()[1]
    result['cases'][name] = {'sql': sql, 'rows': rows, 'plan': plan}
   result['postgresql_statements'] = [line.split('LOG:  ', 1)[-1] for line in (work / 'postgres.log').read_text().splitlines()
    if 'LOG:  ' in line and 'orders' in line and ('SELECT' in line or 'COPY' in line)]
   # Save observations even when a new extension build changes a plan shape.
   pathlib.Path('evidence.json').write_text(json.dumps(result, indent=2) + '\n')
   cases = result['cases']
   assert cases['aggregate']['rows'] == cases['local_control']['rows'] == [
    ['East', 102000], ['North', 102000], ['South', 102000], ['West', 102000]]
   assert 'Remote SQL:' in cases['aggregate']['plan'] and re.search(r'\b4 rows\b', cases['aggregate']['plan'])
   assert 'Remote SQL:' not in cases['local_control']['plan'] and '8,000 rows' in cases['local_control']['plan']
   assert cases['filter']['rows'] == [[1,2],[2,3],[3,4],[4,5]] and 'Remote SQL:' in cases['filter']['plan']
   assert cases['function']['rows'] == [['East',12500],['North',12500],['South',12500],['West',12500]]
   assert 'Remote SQL:' not in cases['function']['plan'] and '10,000 rows' in cases['function']['plan']
   print('Verified four cases, row counts, results, and plan shapes. Wrote evidence.json.')
   if custom_sql:
    print(f'\nYour query from {args.sql}:')
    relation = connection.sql(custom_sql)
    if relation is not None: relation.show()
  finally:
   if connection: connection.close()
   if (work / 'data' / 'postmaster.pid').exists():
    command(tools['pg_ctl'], '-D', data, '-w', 'stop', '-m', 'fast')
if __name__ == '__main__': main()
