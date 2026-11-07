import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
for(const slug of ['fuzzy-matching-duckdb','compare-parquet-duckdb','duckdb-postgresql-query-pushdown']){
 const d=JSON.parse(await readFile(new URL(`src/data/tutorials/${slug}.json`,root)));
 const prefix=d.extension==='rapidfuzz'?"-- DuckDB 2.0. Install once, then load in each session.\nSET allow_extension_repositories = 'allowed';\nCREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm\n  WITH PREFIX 'https://duckdb-extensions.query.farm';\nINSTALL rapidfuzz FROM query_farm;\nLOAD rapidfuzz FROM query_farm;\n\n":'';
 await writeFile(new URL(`public/media/posts/${slug}/setup.sql`,root),d.setup);
 await writeFile(new URL(`public/media/posts/${slug}/walkthrough.sql`,root),prefix+d.setup+'\n'+d.examples.map(e=>'-- '+e.title+'\n'+e.sql).join('\n\n')+'\n');
}
