#!/usr/bin/env node
// Explicitly import reviewed, sanitized evidence. Never copy raw agent event logs.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/sync-vgi-agent-evidence.mjs /path/to/vgi-skills');
const root = resolve(source);
const readJson = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const results = await readJson('evals/results.json');
const stock = await readJson('evals/stock-duckdb.json');
const runId = '20261106T193516Z-claude-typescript-build-skill';
const demoRun = results.results.find(run => run.run_id === runId);
if (!demoRun || demoRun.status !== 'passed') throw new Error('Expected a verified demo run');
const verification = await readJson(`.eval-runs/${runId}/verification.json`);
if (verification.status !== 'passed') throw new Error('Demo SQL verification did not pass');
const rawPrompt = await readFile(resolve(root, `.eval-runs/${runId}/prompt.txt`), 'utf8');
const prompt = rawPrompt.slice(rawPrompt.indexOf('Build a TypeScript'), rawPrompt.indexOf('Do not publish or deploy.') + 'Do not publish or deploy.'.length);
const evidence = {
  recordedOn: results.recorded_at.slice(0, 10),
  environment: results.environment,
  limitations: results.limitations,
  runs: results.results.filter(run => !run.excluded_reason).map(run => ({
    agent: run.agent, case: run.case, withSkill: run.with_skill, status: run.status,
    agentSeconds: run.agent_seconds, verificationSeconds: run.verification_seconds ?? null,
    version: run.agent_version, model: run.model, runId: run.run_id, engine: run.engine || 'haybarn',
  })),
  stockChecks: stock.results.map(run => ({ runId: run.run_id, status: run.status, engineVersion: run.engine_version, extensionVersion: run.extension_version, platform: run.platform })),
  demo: {
    runId, prompt,
    workerSource: await readFile(resolve(root, 'examples/agent-duckdb-typescript-slugify/worker.ts'), 'utf8'),
    logicSource: await readFile(resolve(root, 'examples/agent-duckdb-typescript-slugify/src/slugify.ts'), 'utf8'),
    engine: verification.engine, engineVersion: verification.engine_version,
    checks: verification.checks.map(({ name, sql, status, rows }) => ({ name, sql, status, rows })),
  },
};
await writeFile(new URL('../src/data/vgi-agent-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(`Imported ${evidence.runs.length} reviewed sessions and the recorded demo.`);
