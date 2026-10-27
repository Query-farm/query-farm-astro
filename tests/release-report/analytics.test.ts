import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { newsletterEvent, newsletterSource, trackSiteEvent } from '../../src/lib/newsletter-analytics.ts';
import { releaseFigure, type ReleaseReport } from '../../src/lib/release-report-chart.ts';

test('newsletter submissions carry report attribution and never include an email', () => {
  const calls: unknown[][] = [];
  const runtime = { location: { hostname: 'query.farm' }, gtag: (...args: unknown[]) => calls.push(args) };
  const params = { ...newsletterEvent('release_report', 'duckdb-2-release-activity'), email: 'must-not-be-sent@example.test' };
  assert.equal(trackSiteEvent('newsletter_submit', params, runtime), true);
  assert.deepEqual(calls, [['event', 'newsletter_submit', {
    content_id: 'duckdb-2-release-activity', placement: 'release_report', method: 'buttondown',
    newsletter_name: 'queryfarm-dispatch', subscription_status: 'submitted', transport_type: 'beacon',
  }]]);
  assert.equal(JSON.stringify(calls).includes('must-not-be-sent'), false);
});

test('development, preview hosts, and blocked GA do not emit production events', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'preview.pages.dev']) {
    assert.equal(trackSiteEvent('newsletter_submit', newsletterEvent('footer', 'site'), {
      location: { hostname }, gtag: () => assert.fail('Local event leaked'),
    }), false);
  }
  assert.equal(trackSiteEvent('newsletter_click', newsletterEvent('footer', 'site'), { location: { hostname: 'query.farm' } }), false);
});

test('only a known report ID can be carried through the signup link', () => {
  assert.equal(newsletterSource('/research/duckdb-2-release-activity/', ''), 'duckdb-2-release-activity');
  assert.equal(newsletterSource('/blog/duckdb-2-release-activity/', ''), 'duckdb-2-release-activity');
  assert.equal(newsletterSource('/blog/duckdb-2-release-activity', ''), 'duckdb-2-release-activity');
  assert.equal(newsletterSource('/company/newsletter', '?source=duckdb-2-release-activity'), 'duckdb-2-release-activity');
  assert.equal(newsletterSource('/company/newsletter', '?source=someone@example.test'), 'site');
  assert.equal(newsletterEvent('someone@example.test', 'someone@example.test').placement, 'site');
  assert.equal(newsletterEvent('footer', 'someone@example.test').content_id, 'site');
});

test('every chart selection preserves observed endpoints and uncapped values', () => {
  const report: ReleaseReport = JSON.parse(readFileSync(new URL('../../src/data/research/duckdb-2-release-activity.json', import.meta.url), 'utf8'));
  for (const metric of report.metrics) for (const baseline of ['prerun', 'recent']) for (const view of ['trailing', 'cumulative']) {
    const figure = releaseFigure(report, metric.id, baseline, view);
    const lines = figure.data.filter(trace => trace.mode === 'lines');
    assert.equal(lines.length, 3);
    for (const [i, line] of lines.entries()) {
      const source = report.series[metric.id][baseline][view][i];
      assert.deepEqual(line.x, source.x); assert.deepEqual(line.y, source.y);
      assert.equal(source.dates.length, source.x.length);
      if (source.version === '2.0.0') assert.equal(source.dates.at(-1), report.through);
      for (const value of source.y) if (value !== null) assert.ok(value < figure.layout.yaxis.range[1]);
      if (view === 'cumulative') assert.equal(source.x[0], 0);
    }
  }
});
