#!/usr/bin/env node
// Export only reviewed tool calls. Never publish raw session metadata or reasoning.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-vgi-agent-story.mjs /path/to/vgi-skills');
const root = resolve(process.argv[2]);
const runId = '20261106T193516Z-claude-typescript-build-skill';
const run = resolve(root, '.eval-runs', runId);
const example = resolve(root, 'examples/agent-duckdb-typescript-slugify');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const result = await json(resolve(run, 'result.json'));
const verification = await json(resolve(example, 'verification.json'));
const independent = await json(resolve(run, 'verification.json'));
if ([result, verification, independent].some(item => item.status !== 'passed')) throw new Error('All verification must pass before export');
const worker = await readFile(resolve(example, 'worker.ts'), 'utf8');
for (const file of ['worker.ts', 'src/slugify.ts', 'test/slugify.test.ts']) {
  if (await readFile(resolve(example, file), 'utf8') !== await readFile(resolve(run, 'project', file), 'utf8')) throw new Error(`${file} changed since recorded session`);
}
const events = (await readFile(resolve(run, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
const calls = [];
for (const event of events) for (const content of event.message?.content || []) {
  if (content.type === 'tool_use' && content.name === 'Bash') calls.push({ id: content.id, command: content.input.command, output: '' });
  if (content.type === 'tool_result') {
    const call = calls.find(call => call.id === content.tool_use_id);
    if (call) call.output = typeof content.content === 'string' ? content.content : content.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  }
}
const unit = calls.find(call => call.command.includes('cat > test/slugify.test.ts'));
const sql = calls.find(call => call.command.includes('cat > vgi-worker.json'));
const write = calls.find(call => call.command.includes('cat > src/slugify.ts'));
const revision = calls.find(call => call.command.includes('sed -i') && call.command.includes('TSC OK'));
if (!unit || !sql || !write || !revision) throw new Error('Recorded tool calls missing');
const check = name => { const found = verification.checks.find(check => check.name === name); if (!found) throw new Error(name); return found; };
const prompt = (await readFile(resolve(run, 'prompt.txt'), 'utf8')).split('\n\n')[1].split('\nThe verification manifest')[0];
const scrub = value => value.replaceAll(resolve(run, 'project'), '.').replaceAll(run, '[recorded run]').replaceAll(root, '[skills repo]');
const captions = [
  'Claude Code built this worker and tested it through DuckDB. Here is the actual result.',
  'The request names the function and language, and asks the agent to preserve NULL and run tests.',
  'Claude Code writes the worker and its implementation. This is the generated source from the completed session.',
  'But source code needs proof. The agent writes and runs unit tests: eleven pass.',
  'Therefore, it also runs the worker through DuckDB. All seven of its SQL checks pass.',
  'A separate verifier checks the generated worker on ten thousand rows. Those checks also pass.',
  'Now use the same function on a CSV. This follow-on query was verified after the recorded build. Choose your agent and language to build your own.',
];
const frames = [
  { title: 'Your agent can build this DuckDB function.', label: 'Actual SQL result · generated worker', code: `${check('quickstart result').sql};\n\n┌───────────┐\n│ slug      │\n├───────────┤\n│ hello-vgi │\n└───────────┘`, seconds: 6, footer: 'Claude Code · TypeScript · 98.4s build + 1.0s independent verification' },
  { title: 'You describe the function.', label: 'Recorded request · excerpt', code: prompt.split('Do not publish')[0].trim().replace(' Run the worker', '\n\nRun the worker').replace(' Use published', '\n\nUse published'), seconds: 9, footer: 'The vgi-worker skill is installed. The developer chose TypeScript for this run.' },
  { title: 'Claude Code writes the worker.', label: 'worker.ts · generated source excerpt', code: worker.slice(worker.indexOf('export const slugifyFn'), worker.indexOf('new Worker')).replace(/  description:[\s\S]*?  params:/, '  params:').replace(/  argDocs:.*\n/, '').trim(), seconds: 10, footer: 'The project also contains the slugify implementation, dependencies, and tests.' },
  { title: 'But generated code needs tests.', label: 'Actual agent tool call and output', code: '$ ' + unit.command.split('\n').at(-1) + '\n\n' + unit.output.trim(), seconds: 9, footer: 'Claude Code wrote and ran these tests in the recorded session.' },
  { title: 'Therefore, the agent checks real SQL.', label: 'Actual agent tool output · stock DuckDB 2.0.0', code: sql.output.split('\nuv run')[0].trim(), seconds: 11, footer: 'The agent attached its worker through VGI and checked actual query results.' },
  { title: 'A separate verifier checks 10,000 rows.', label: 'Independent verification · same recorded build', code: independent.checks.find(check => check.name === 'independent multi-batch').sql.replace(' FROM ', '\nFROM ').replace(' WHERE ', '\nWHERE ').replace(' = ', '\n  = ') + ';\n\nActual rows: [[10000]]\nStatus: passed', seconds: 8, footer: 'Known values and SQL NULL passed independently too. No human corrections during the build.' },
  { title: 'Use that function on your data.', label: 'Verified follow-on · articles.csv', code: check('article CSV').sql + ';\n\n' + check('article CSV').rows.map(row => row.join('  →  ')).join('\n'), seconds: 10, footer: 'Same generated worker. Choose your agent and language at query.farm/vgi/build-with-an-agent/' },
].map((frame, i) => ({ ...frame, code: scrub(frame.code), caption: captions[i] }));
const data = { runId, recordedOn: '2026-11-06', agentSeconds: result.agent_seconds, verificationSeconds: result.verification_seconds, engine: verification.engine_version, csv: check('article CSV'), frames };
await writeFile(new URL('../src/data/vgi-agent-story.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
await writeFile(new URL('../public/vgi/agents/articles.csv', import.meta.url), await readFile(resolve(example, 'articles.csv')));
const transcript = ['VGI: a real Claude Code build', 'Recorded 2026-11-06. Edited tool transcript, not a live session.', 'Selected request, tool calls, and outputs. Dependency inspection, setup, reasoning, and session metadata are omitted. Local paths are shortened. The CSV follow-on was added and verified after the session. Source excerpts are labeled.', '', 'REQUEST', scrub(prompt), '', 'INITIAL AGENT FILE CREATION (intermediate source; see the revision below and linked final project)', scrub(write.command), '', 'AGENT SOURCE REVISION AND TYPE CHECK', scrub(revision.command), scrub(revision.output), '', 'AGENT UNIT TESTS', scrub(unit.command), scrub(unit.output), '', 'AGENT SQL TESTS', scrub(sql.command), scrub(sql.output), '', 'INDEPENDENT VERIFICATION', JSON.stringify(independent.checks, null, 2), '', 'FOLLOW-ON CSV QUERY (added after the session)', JSON.stringify(check('article CSV'), null, 2)].join('\n');
if (/\/Users\/|api[_-]?key\s*[:=]|sk-ant-/i.test(transcript)) throw new Error('Review transcript for local paths or credentials');
await writeFile(new URL('../public/vgi/agents/build-transcript.txt', import.meta.url), transcript.replace(/[ \t]+$/gm, ''));
console.log(`Exported ${frames.length} transcript chapters and verified CSV results.`);
