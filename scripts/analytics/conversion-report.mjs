#!/usr/bin/env node
// Read local exports only. This script never changes Google configuration.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { conversionReport } from '../../src/lib/conversion-reporting.ts';

const { values } = parseArgs({ options: {
  events: { type: 'string' }, 'key-events': { type: 'string' },
  start: { type: 'string' }, end: { type: 'string' }, output: { type: 'string' },
} });
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
if (!values.events || !values['key-events'] || !validDate(values.start) || !validDate(values.end) || values.start > values.end) {
  throw new Error('Usage: node --import tsx scripts/analytics/conversion-report.mjs --events events.json --key-events key-events.json --start YYYY-MM-DD --end YYYY-MM-DD [--output report.json]');
}
const events = JSON.parse(readFileSync(values.events, 'utf8'));
const keyEvents = JSON.parse(readFileSync(values['key-events'], 'utf8'));
if (!Array.isArray(events) || !Array.isArray(keyEvents) || keyEvents.some(e => typeof e?.event_name !== 'string')) {
  throw new Error('Both exports must be JSON arrays; key-event rows need event_name.');
}
const report = {
  period: { start: values.start, end: values.end },
  sources: { events: values.events, key_events: values['key-events'] },
  ...conversionReport(events, keyEvents),
};
const output = JSON.stringify(report, null, 2) + '\n';
if (values.output) writeFileSync(values.output, output);
else process.stdout.write(output);
