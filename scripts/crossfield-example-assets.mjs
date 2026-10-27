#!/usr/bin/env node
// Package existing, independently authored Crossfield fixtures for the website.
// This script does not build an engine, execute SQL or record test passes.
// Usage: node scripts/crossfield-example-assets.mjs [/path/to/crossfield]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? join(site, '../duckdb-metrics/crossfield'));
const output = join(site, 'public/crossfield/examples');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const engine = 'd54cbbe3df17e8e5ce68312f483b4155836112aa';
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const read = (path) => readFileSync(join(source, path), 'utf8');
const records = new Map();
const archiveTimestamp = new Date('2000-01-01T12:00:00Z');

function write(bundle, path, content, origin) {
  const full = join(output, bundle, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  utimesSync(full, archiveTimestamp, archiveTimestamp);
  if (!records.has(bundle)) records.set(bundle, []);
  records.get(bundle).push({ path, sha256: sha256(content), ...(origin ? { source: origin } : {}) });
}
function copy(bundle, from, to = from) {
  const content = readFileSync(join(source, from));
  write(bundle, to, content, { path: from, sha256: sha256(content), modification: 'none' });
}
function readme(bundle, title, description, details) {
  write(bundle, 'README.md', `# ${title}\n\n${description}\n\n## Run\n\nExtract the archive and change into the \`${bundle}/\` directory. Start a fresh\nconnection using the matching Query Farm DuckDB build and Crossfield extension:\n\n\`\`\`sh\n/path/to/matched/duckdb -unsigned -cmd "LOAD '/absolute/path/to/crossfield.duckdb_extension';"\n\`\`\`\n\nThen run:\n\n\`\`\`sql\n.bail on\n.read setup.sql\n.read run.sql\n\`\`\`\n\nThe paths in these files are relative to this directory. \`setup.sql\` creates\nsource objects and attaches the model; run it once in a fresh connection.\n\`run.sql\` selects the mode explicitly. You can also redirect \`session.sql\` into\nthe same CLI command for a batch run.\n\nThis is not a stock DuckDB extension-installation example. The required engine\nbase is \`${engine}\`, plus Crossfield's eight maintained DuckDB\npatches, and the extension must match that engine and platform. The bundle does\nnot include binaries. Use the matching artifacts supplied for your evaluation;\n\`INSTALL crossfield\` against stock DuckDB is not a supported substitute.\n\n## Expected results and scope\n\n${details}\n\nExpected CSV files are independently specified answers, not captured transcripts.\nThe included model JSON is copied without semantic changes from the maintained\nCrossfield fixtures. \`provenance.json\` records source files, hashes and the source\ncheckout revision. Packaging does not execute SQL or establish a new test pass.\n\nTo inspect the compilation, run \`.read explain.sql\` after setup. This invokes\n\`EXPLAIN (SEMANTIC)\`; it does not execute a provider.\n`);
  write(bundle, 'session.sql', '.bail on\n.mode box\n.read setup.sql\n.read run.sql\n');
}

// Frozen retail data and both exact packages, including their embedded models.
for (const name of ['orders.csv', 'items.csv', 'products.csv', 'stores.csv', 'customers.csv', 'supplies.csv', 'LICENSE', 'NOTICE', 'snapshot.json']) {
  copy('retail', `test/public_workloads/jaffle/${name}`, `data/${name}`);
}
for (const version of [1, 2]) {
  copy('retail', `examples/jaffle-shop/jaffle-v${version}.package.json`, `jaffle-v${version}.package.json`);
  for (const kind of ['ossie', 'crossfield']) {
    copy('retail', `examples/jaffle-shop/models/jaffle-v${version}.${kind}.json`, `models/jaffle-v${version}.${kind}.json`);
  }
}
const attach = read('examples/jaffle-shop/attach.sql').replaceAll('examples/jaffle-shop/', '');
const physicalSetup = read('examples/jaffle-shop/setup.sql')
  .replace('Run from the Crossfield repository root', 'Run from the extracted retail directory')
  .replaceAll('test/public_workloads/jaffle/', 'data/');
write('retail', 'attach.sql', attach, { path: 'examples/jaffle-shop/attach.sql', modification: 'Only relative package paths changed.' });
write('retail', 'setup.sql', `${physicalSetup}\n${attach}`, {
  paths: ['examples/jaffle-shop/setup.sql', 'examples/jaffle-shop/attach.sql'],
  modification: 'Concatenated physical setup and attachment; adjusted comments and relative paths only.'
});
write('retail', 'run.sql', `-- Result 1: expected/by-store.csv. Each fact keeps its own grain.\nSET crossfield_mode = 'strict';\nSELECT store_name, order_count, item_count, revenue\nFROM SEMANTIC jaffle_current.jaffle\nGROUP BY store_name ORDER BY store_name;\n\n-- Result 2: expected/totals.csv. Same definitions without a grouping dimension.\nSELECT order_count, item_count, revenue\nFROM SEMANTIC jaffle_current.jaffle;\n\n-- Result 3: expected/revisions.csv. Reconcile two definitions over identical rows.\n-- Semantic mode permits outer arithmetic over independently governed blocks.\nSET crossfield_mode = 'semantic';\nWITH previous AS (\n    SELECT revenue FROM SEMANTIC jaffle_old.jaffle\n), current AS (\n    SELECT revenue FROM SEMANTIC jaffle_current.jaffle\n)\nSELECT p.revenue AS previous_revenue, c.revenue AS current_revenue,\n       c.revenue - p.revenue AS change\nFROM previous p CROSS JOIN current c;\n`);
write('retail', 'explain.sql', `SET crossfield_mode = 'strict';\nEXPLAIN (SEMANTIC)\nSELECT store_name, order_count, item_count, revenue\nFROM SEMANTIC jaffle_current.jaffle\nGROUP BY store_name ORDER BY store_name;\n`);
write('retail', 'reject.sql', `-- Deliberate rejection: raw tables are outside strict semantic queries.\n-- Expected: strict-mode rejection of this unapproved raw-source query.\nSET crossfield_mode = 'strict';\nSELECT SUM(total) FROM warehouse.orders;\n`);
write('retail', 'expected/by-store.csv', 'store_name,order_count,item_count,revenue\nBrooklyn,19,36,255.00\nPhiladelphia,506,798,6100.00\n');
write('retail', 'expected/totals.csv', 'order_count,item_count,revenue\n525,834,6355.00\n');
write('retail', 'expected/revisions.csv', 'previous_revenue,current_revenue,change\n6730.75,6355.00,-375.75\n');
readme('retail', 'Retail: one definition, different reporting questions',
  'Jaffle Shop is a fictional retailer. This frozen sample contains 525 orders,\n834 receipt lines and store, product and customer dimensions. No API, VGI worker\nor external database is required.',
  `The three queries in \`run.sql\` correspond, in order, to \`expected/by-store.csv\`,\n\`expected/totals.csv\` and \`expected/revisions.csv\`. Revenue is in USD. Revision 1\nincludes collected tax; revision 2 excludes it. Both packages bind to the same\nphysical rows. Orders and receipt lines aggregate independently, so an order's\nrevenue is not multiplied by its line count.\n\n\`setup.sql\` already includes the statements in \`attach.sql\`; do not execute\n\`attach.sql\` again. Readable source definitions are under \`models/\`; attachment\nuses the packaged copies. \`reject.sql\` is an optional deliberate failure and is\nexcluded from the successful batch run.\n\nData attribution, license, generator pin and snapshot hashes are retained in\n\`data/NOTICE\`, \`data/LICENSE\` and \`data/snapshot.json\`. The complete frozen CSV\nset includes \`supplies.csv\`, which this model does not query. Only generated data\nis reused from Jaffle's generator; semantic models and numerical expectations\nare independently authored in Crossfield.`);

// Dataset-local recipes in the current Ossie profile, with Crossfield approvals.
copy('ossie', 'test/models/ossie-dataset-metrics.ossie.json', 'model.ossie.json');
write('ossie', 'setup.sql', `CREATE TABLE scoped_orders(\n    source_id INTEGER PRIMARY KEY, raw_amount INTEGER, region VARCHAR, status VARCHAR\n);\nINSERT INTO scoped_orders VALUES\n    (1,10,'N','paid'), (2,20,'N','unpaid'), (3,NULL,'N','paid'),\n    (4,5,'S','unpaid'), (5,7,'E',NULL);\nCREATE TABLE scoped_returns(\n    source_id INTEGER PRIMARY KEY, raw_amount INTEGER, region VARCHAR\n);\nINSERT INTO scoped_returns VALUES (1,3,'N'), (2,4,'S');\nATTACH 'model.ossie.json' AS local_metrics (TYPE crossfield);\n`, { path: 'test/sql/compiler/ossie_dataset_metrics.test', modification: 'Extracted source setup; local model path.' });
write('ossie', 'run.sql', `SET crossfield_mode = 'strict';\nSELECT orders.revenue AS sales, returns.revenue AS refunds\nFROM SEMANTIC local_metrics.scoped_sales;\n`);
write('ossie', 'explain.sql', `SET crossfield_mode = 'strict';\nEXPLAIN (SEMANTIC)\nSELECT orders.revenue AS sales, returns.revenue AS refunds\nFROM SEMANTIC local_metrics.scoped_sales;\n`);
write('ossie', 'expected/results.csv', 'sales,refunds\n84,7\n');
readme('ossie', 'Ossie: dataset-scoped metric definitions',
  'Two datasets each define a metric named revenue. Their canonical metric names\nremain distinct, and each recipe resolves fields in its own dataset.',
  `\`expected/results.csv\` contains sales **84** and refunds **7**. The orders\ndataset defines logical amount as \`raw_amount * 2\`, so its revenue is\n\`2 × (10 + 20 + 5 + 7) = 84\`; SQL SUM ignores the one NULL. Returns use their\nown amount definition, giving \`3 + 4 = 7\`.\n\nThe copied fixture targets the Ossie \`0.2.0.dev0\` / \`OSSIE_SQL_2026\` profile.\nIts \`custom_extensions\` entry supplies Crossfield execution approvals. The full\nfixture also contains Crossfield root metric composition and window examples;\nit is not a claim that every definition is portable to every Ossie consumer.\n\`FROM SEMANTIC\` is Crossfield SQL, not an Ossie-standard query language.`);

// UTC native measurement fixture: no weather service or VGI transport dependency.
for (const file of ['utc.crossfield.json', 'source.ossie.json']) {
  copy('measurements', `test/models/measurement/${file}`, `models/${file}`);
}
write('measurements', 'setup.sql', `LOAD icu;\nSET TimeZone = 'UTC';\nCREATE TABLE measurement_rows(\n    id INTEGER PRIMARY KEY, location VARCHAR, time TIMESTAMPTZ,\n    start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, seconds DOUBLE, amount DOUBLE,\n    mean_value DOUBLE, instant DOUBLE, event_at TIMESTAMPTZ,\n    unknown_value DOUBLE, probability DOUBLE, offset_seconds INTEGER\n);\nINSERT INTO measurement_rows VALUES\n(1,'A','2024-01-02 00:00+00','2024-01-01 23:00+00','2024-01-02 00:00+00',3600,5,10,99,'2024-01-02 00:00+00',7,20,0),\n(2,'A','2024-01-02 01:00+00','2024-01-02 00:00+00','2024-01-02 01:00+00',3600,3,20,98,'2024-01-02 01:00+00',8,50,0),\n(3,'A','2024-01-02 03:00+00','2024-01-02 01:00+00','2024-01-02 03:00+00',7200,4,50,97,'2024-01-02 03:00+00',9,70,0),\n(4,'B','2024-01-02 00:00+00','2024-01-01 23:00+00','2024-01-02 00:00+00',3600,11,30,96,'2024-01-02 00:00+00',6,10,0);\nATTACH 'models/utc.crossfield.json' AS weather_model (TYPE crossfield);\n`, { path: 'test/sql/metrics/measurement_intervals.test', modification: 'Extracted initial UTC source setup, explicitly loaded ICU, adjusted model path.' });
write('measurements', 'run.sql', `SET crossfield_mode = 'strict';\nSELECT location, report_day, rainfall, weighted_flux\nFROM SEMANTIC weather_model.measurements\nGROUP BY location, report_day ORDER BY location, report_day;\n`);
write('measurements', 'explain.sql', `SET crossfield_mode = 'strict';\nEXPLAIN (SEMANTIC)\nSELECT location, report_day, rainfall, weighted_flux\nFROM SEMANTIC weather_model.measurements\nGROUP BY location, report_day ORDER BY location, report_day;\n`);
write('measurements', 'reject.sql', `-- Deliberate rejection: this mean has no approved duration-weighted recipe.\n-- Expected diagnostic: MEASUREMENT_AGGREGATION_REQUIRED.\nSET crossfield_mode = 'strict';\nSELECT report_day, unsafe_mean\nFROM SEMANTIC weather_model.measurements GROUP BY report_day;\n`);
write('measurements', 'expected/results.csv', 'location,report_day,rainfall,weighted_flux\nA,2024-01-01,5,10\nA,2024-01-02,7,40\nB,2024-01-01,11,30\n');
readme('measurements', 'Measurements: the interval matters at midnight',
  'Four synthetic rows demonstrate native measurement-interval semantics. The\nexample does not call Open-Meteo, use VGI or claim a new worker integration result.',
  `\`expected/results.csv\` gives three groups. Location A's 5 mm observation is\nlabelled midnight on January 2, but represents January 1 at 23:00 through\nmidnight, so it belongs to January 1. On January 2, A's amounts add to 7 mm and\nits approved duration-weighted flux mean is \`(20 × 1 + 50 × 2) / 3 = 40\`.\nLocation B's 11 mm uses an independent coverage series, despite matching A's\ntimestamps.\n\nThe fixture's flux unit is W/m². The weighted result is still a mean flux, not\nenergy. Whole-interval assignment neither splits nor prorates measurements.\nThese sparse rows do not claim complete daily coverage. Instantaneous, event-time\nand unknown-support fields coexist without inheriting the interval's meaning.\n\nThe matching build must include ICU; \`setup.sql\` loads it explicitly. This\nbounded example uses UTC. The maintained native suite separately covers DST and\nfixed offsets. \`reject.sql\` demonstrates an unapproved temporal aggregation and\nis intentionally excluded from the successful batch run. The full fixture\ncontains deliberately unsafe recipes for rejection tests; their presence is not\nan approval to execute them.`);

// Approved native range providers demonstrate retrieval without an API dependency.
copy('pipelines', 'test/models/semantic-overloads.crossfield.json', 'model.crossfield.json');
write('pipelines', 'setup.sql', `ATTACH 'model.crossfield.json' AS arithmetic (TYPE crossfield);\n`);
write('pipelines', 'run.sql', `SET crossfield_mode = 'strict';\n-- Result 1: expected/direct.csv. Required input can be positional.\nSELECT number_count, number_sum\nFROM SEMANTIC arithmetic.numbers(5);\n\n-- Result 2: expected/named.csv. Equivalent named call.\nSELECT number_count, number_sum\nFROM SEMANTIC arithmetic.numbers(stop => 5);\n\n-- Result 3: expected/pipeline.csv. The model owns the retrieval dependency.\nSELECT number_count, number_sum\nFROM SEMANTIC arithmetic.numbers(seed => 4);\n`);
write('pipelines', 'explain.sql', `SET crossfield_mode = 'strict';\nEXPLAIN (SEMANTIC)\nSELECT number_count, number_sum\nFROM SEMANTIC arithmetic.numbers(seed => 4);\n`);
write('pipelines', 'expected/direct.csv', 'number_count,number_sum\n5,10\n');
write('pipelines', 'expected/named.csv', 'number_count,number_sum\n5,10\n');
write('pipelines', 'expected/pipeline.csv', 'number_count,number_sum\n3,6\n');
readme('pipelines', 'Typed inputs and model-owned retrieval',
  'This native fixture uses DuckDB range functions, with no API credentials,\nnetwork service or VGI worker. All entry points reuse one canonical numbers\ndataset and the same count/sum definitions.',
  `The three queries correspond to \`expected/direct.csv\`, \`expected/named.csv\`\nand \`expected/pipeline.csv\`. The direct call produces 0, 1, 2, 3, 4: count **5**,\nsum **10**. The equivalent named call has the same answer.\n\nThe \`seed => 4\` signature first generates candidates 0, 1, 2, 3. Its model-owned\nfilter excludes zero, then calls an approved one-element range for each remaining\ncandidate. The final rows are 1, 2, 3: count **3**, sum **6**. The caller supplies\na scope input without writing an invocation document or a lateral join.\n\n\`stop\` accepts a required positional-or-named BIGINT. \`seed\` is a required\nkeyword-only BIGINT and selects a different declared signature. The engine does\nnot infer scope from a string's contents or choose a provider by trying it.\nThe full fixture includes additional signatures used by native regression tests;\nthese three calls are the bounded website demonstration.`);

const nativeTests = {
  retail: 'test/sql/examples/jaffle_shop.test',
  ossie: 'test/sql/compiler/ossie_dataset_metrics.test',
  measurements: 'test/sql/metrics/measurement_intervals.test',
  pipelines: 'test/sql/compiler/semantic_overloads.test'
};
const index = [];
for (const [bundle, files] of records) {
  const provenance = {
    format: 'crossfield.website-example', version: 1,
    source_checkout_commit: sourceCommit,
    source_note: 'Working-tree files are copied as recorded by their individual hashes; the checkout commit alone does not assert a clean tree.',
    engine_requirement: { base_commit: engine, crossfield_patch_count: 8, matching_extension_required: true },
    native_fixture: nativeTests[bundle],
    evidence: 'Expected answers are independently specified fixture expectations. Asset generation does not execute SQL or claim a fresh pass.',
    files: [...files].sort((a, b) => a.path.localeCompare(b.path))
  };
  writeFileSync(join(output, bundle, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  utimesSync(join(output, bundle, 'provenance.json'), archiveTimestamp, archiveTimestamp);
  const archiveFiles = [...files.map((file) => `${bundle}/${file.path}`), `${bundle}/provenance.json`].sort();
  const temporary = join(output, `${bundle}.next.zip`);
  rmSync(temporary, { force: true });
  execFileSync('zip', ['-X', '-q', temporary, ...archiveFiles], { cwd: output, env: { ...process.env, TZ: 'UTC' } });
  renameSync(temporary, join(output, `${bundle}.zip`));
  index.push({ name: bundle, archive: `${bundle}.zip`, sha256: sha256(readFileSync(join(output, `${bundle}.zip`))) });
}
writeFileSync(join(output, 'index.json'), JSON.stringify({ format: 'crossfield.website-examples', version: 1, examples: index }, null, 2) + '\n');
console.log(`Packaged ${index.length} self-contained examples in ${output}; no SQL executed.`);
