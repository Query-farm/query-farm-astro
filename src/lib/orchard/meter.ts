// Usage metering: integrate `deployment_events` into instance-minutes per
// (organisation, size, UTC day) and report each total to Stripe Billing
// Meters. Pages has no cron, so .github/workflows/orchard-meter.yml calls
// POST /api/orchard/meter daily with ORCHARD_METER_TOKEN.
//
// Every report has a deterministic identifier — orchard-<org>-<size>-<day> —
// stored in `meter_reports` and sent to Stripe, so a re-run (or the Action
// retrying) never double-bills: D1 skips days already sent, and Stripe rejects
// a duplicate identifier as `duplicate_meter_event`.

import { eventsBefore, type DeploymentEventRow } from './db';
import { json, log, nowIso, timingSafeEqual, readJson, type Fetch, type OrchardEnv } from './http';
import { SIZES, sizeById, type SizeId } from './pricing';
import { STRIPE_API, STRIPE_V2_VERSION } from './stripe';

const DAY_MS = 86_400_000;

export interface UsageKey { org: string; size: SizeId }

/**
 * Instance-minutes in [start, end) per `org|size`, from events ordered by
 * deployment then time. Each event sets a deployment's instance count from
 * its `occurred_at` onward; the count before the first event is zero.
 * Returns unrounded minutes.
 */
export function instanceMinutes(events: DeploymentEventRow[], start: Date, end: Date): Map<string, number> {
  const totals = new Map<string, number>();
  const from = start.getTime(), to = end.getTime();
  const add = (e: DeploymentEventRow, a: number, b: number) => {
    const lo = Math.max(a, from), hi = Math.min(b, to);
    if (hi <= lo || e.instances <= 0) return;
    const key = `${e.org_id}|${e.size}`;
    totals.set(key, (totals.get(key) ?? 0) + e.instances * (hi - lo) / 60_000);
  };
  for (let i = 0; i < events.length; i++) {
    const e = events[i], next = events[i + 1];
    const a = Date.parse(e.occurred_at);
    const b = next && next.deployment_id === e.deployment_id ? Date.parse(next.occurred_at) : Infinity;
    add(e, a, b);
  }
  return totals;
}

export const dayString = (d: Date) => d.toISOString().slice(0, 10);
export const meterIdentifier = (org: string, size: SizeId, day: string) => `orchard-${org}-${size}-${day}`;

/** Complete UTC days to report: by default the three before today, so a missed run catches up. */
export function defaultDays(now: Date, count = 3): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, i) => dayString(new Date(today - (count - i) * DAY_MS)));
}

export interface MeterReport {
  identifier: string;
  org: string;
  size: SizeId;
  day: string;
  minutes: number;
  status: 'sent' | 'already_sent' | 'skipped' | 'failed';
  detail?: string;
}

export async function runMeter(env: OrchardEnv, days: string[], fetchImpl: Fetch, now = new Date()): Promise<MeterReport[]> {
  const db = env.ORCHARD_DB!;
  const reports: MeterReport[] = [];
  for (const day of days) {
    const start = new Date(`${day}T00:00:00.000Z`), end = new Date(start.getTime() + DAY_MS);
    // Stripe accepts timestamps from the past 35 days; only complete days are reported.
    if (end.getTime() > now.getTime() || now.getTime() - end.getTime() > 34 * DAY_MS) {
      reports.push({ identifier: `orchard-*-*-${day}`, org: '*', size: 's', day, minutes: 0, status: 'skipped', detail: 'outside_window' });
      continue;
    }
    const totals = instanceMinutes(await eventsBefore(db, end.toISOString()), start, end);
    for (const [key, raw] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
      const [org, size] = key.split('|') as [string, SizeId];
      const minutes = Math.round(raw);
      const identifier = meterIdentifier(org, size, day);
      const report: MeterReport = { identifier, org, size, day, minutes, status: 'sent' };
      reports.push(report);
      if (minutes <= 0) { report.status = 'skipped'; report.detail = 'zero'; continue; }
      const prior = await db.prepare('SELECT status FROM meter_reports WHERE identifier = ?').bind(identifier).first<{ status: string }>();
      if (prior?.status === 'sent') { report.status = 'already_sent'; continue; }
      const orgRow = await db.prepare('SELECT stripe_customer_id FROM orgs WHERE id = ?').bind(org).first<{ stripe_customer_id: string | null }>();
      const sizeConfig = sizeById(size);
      if (!orgRow?.stripe_customer_id || !sizeConfig) {
        report.status = 'skipped';
        report.detail = 'no_customer';
      } else {
        const sent = await sendMeterEvent(env, fetchImpl, {
          event_name: sizeConfig.meterEvent,
          identifier,
          timestamp: `${day}T23:59:59.000Z`,
          payload: { stripe_customer_id: orgRow.stripe_customer_id, value: String(minutes) },
        });
        report.status = sent.ok ? 'sent' : 'failed';
        if (sent.detail) report.detail = sent.detail;
      }
      await db.prepare(`INSERT INTO meter_reports (identifier, org_id, size, day, minutes, status, detail, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(identifier) DO UPDATE SET minutes = excluded.minutes, status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at`)
        .bind(identifier, org, size, day, minutes, report.status, report.detail ?? null, nowIso()).run();
      log(report.status === 'failed' ? 'error' : 'info', 'orchard_meter', { identifier, minutes, status: report.status, detail: report.detail });
    }
  }
  return reports;
}

async function sendMeterEvent(env: OrchardEnv, fetchImpl: Fetch, event: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetchImpl(`${STRIPE_API}/v2/billing/meter_events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/json', 'Stripe-Version': STRIPE_V2_VERSION },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return { ok: true };
    let code = '';
    try {
      const body = await response.json() as { error?: { code?: string } };
      code = body.error?.code ?? '';
    } catch { /* non-JSON error */ }
    // Already recorded by Stripe within its 24-hour window: treat as sent.
    if (code === 'duplicate_meter_event') return { ok: true, detail: 'duplicate_meter_event' };
    return { ok: false, detail: `stripe_${response.status}${code ? `_${code}` : ''}` };
  } catch {
    return { ok: false, detail: 'stripe_unreachable' };
  }
}

/** POST /api/orchard/meter — `Authorization: Bearer $ORCHARD_METER_TOKEN`, optional body `{ "days": ["YYYY-MM-DD", …] }`. */
export async function handleMeter(request: Request, env: OrchardEnv, fetchImpl: Fetch = fetch, now = new Date()): Promise<Response> {
  if (!env.ORCHARD_METER_TOKEN || !env.STRIPE_SECRET_KEY || !env.ORCHARD_DB) return json({ ok: false, error: 'Metering is not configured.' }, 503);
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !await timingSafeEqual(auth.slice(7), env.ORCHARD_METER_TOKEN)) return json({ ok: false, error: 'Unauthorized.' }, 401);
  const body = request.headers.get('Content-Type')?.includes('json') ? await readJson(request) : null;
  const requested = Array.isArray(body?.days) ? (body!.days as unknown[]).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)) : [];
  const days = requested.length ? requested.slice(0, 35) : defaultDays(now);
  const reports = await runMeter(env, days, fetchImpl, now);
  const failed = reports.filter(r => r.status === 'failed').length;
  const count = (s: MeterReport['status']) => reports.filter(r => r.status === s).length;
  return json({ ok: failed === 0, days, sent: count('sent'), already_sent: count('already_sent'), skipped: count('skipped'), failed, reports }, failed ? 502 : 200);
}

/** Month-to-date instance-minutes for one org, per size — for the console. */
export async function monthToDate(env: OrchardEnv, orgId: string, now = new Date()): Promise<Record<SizeId, number>> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const totals = instanceMinutes(await eventsBefore(env.ORCHARD_DB!, now.toISOString(), orgId), start, now);
  return Object.fromEntries(SIZES.map(s => [s.id, totals.get(`${orgId}|${s.id}`) ?? 0])) as Record<SizeId, number>;
}
