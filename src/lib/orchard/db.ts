// D1 access for hosted Orchard. Minimal structural D1 types keep this usable
// in Pages and in Node tests, which run the real migration on node:sqlite.

import type { SizeId } from './pricing';

export interface OrchardStatement {
  bind(...values: (string | number | null)[]): OrchardStatement;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface OrchardDatabase {
  prepare(sql: string): OrchardStatement;
  batch(statements: OrchardStatement[]): Promise<{ success: boolean; meta?: { changes?: number } }[]>;
}

export interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: string;
  payment_status: string | null;
  license_item_id: string | null;
  billing_event_at: number | null;
}

export type DeploymentStatus = 'requested' | 'provisioning' | 'live' | 'stopped' | 'rejected';
export interface DeploymentRow {
  id: string;
  org_id: string;
  worker: string;
  worker_name: string;
  catalog: string;
  version: string | null;
  paid: number;
  size: SizeId;
  region: string;
  desired_instances: number;
  actual_instances: number;
  status: DeploymentStatus;
  endpoint: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

export type RequestKind = 'create' | 'scale' | 'stop';
export type RequestStatus = 'new' | 'in_progress' | 'done' | 'rejected';
export interface RequestRow {
  id: string;
  deployment_id: string;
  org_id: string;
  kind: RequestKind;
  desired_instances: number;
  status: RequestStatus;
  note: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  resolved_by: string | null;
}

export interface DeploymentEventRow {
  deployment_id: string;
  org_id: string;
  size: SizeId;
  instances: number;
  occurred_at: string;
}

export const BILLING_OK = ['active', 'trialing'];

export const getOrg = (db: OrchardDatabase, id: string) =>
  db.prepare('SELECT * FROM orgs WHERE id = ?').bind(id).first<OrgRow>();

export const orgForUser = (db: OrchardDatabase, userId: string) =>
  db.prepare('SELECT org_id FROM members WHERE user_id = ? ORDER BY created_at LIMIT 1').bind(userId).first<{ org_id: string }>();

export async function upsertOrgAndMember(db: OrchardDatabase, org: { id: string; name: string }, member: { userId: string; email: string; name: string }, at: string) {
  const results = await db.batch([
    db.prepare('INSERT INTO orgs (id, name, created_at, created_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(org.id, org.name, at, member.userId),
    db.prepare(`INSERT INTO members (org_id, user_id, email, name, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)
      ON CONFLICT(org_id, user_id) DO UPDATE SET email = excluded.email, name = excluded.name`)
      .bind(org.id, member.userId, member.email, member.name || null, at),
  ]);
  if (results.some(r => !r.success)) throw new Error('Organisation storage failed');
}

export const listDeployments = async (db: OrchardDatabase, orgId: string) =>
  (await db.prepare('SELECT * FROM deployments WHERE org_id = ? ORDER BY created_at DESC').bind(orgId).all<DeploymentRow>()).results;

export const getDeployment = (db: OrchardDatabase, orgId: string, id: string) =>
  db.prepare('SELECT * FROM deployments WHERE id = ? AND org_id = ?').bind(id, orgId).first<DeploymentRow>();

export const openRequests = async (db: OrchardDatabase, orgId: string) =>
  (await db.prepare("SELECT * FROM requests WHERE org_id = ? AND status IN ('new', 'in_progress') ORDER BY created_at").bind(orgId).all<RequestRow>()).results;

/** Every deployment event before `end`, in order — the input to metering. */
export const eventsBefore = async (db: OrchardDatabase, end: string, orgId?: string) =>
  (await (orgId
    ? db.prepare('SELECT deployment_id, org_id, size, instances, occurred_at FROM deployment_events WHERE occurred_at < ? AND org_id = ? ORDER BY deployment_id, occurred_at, id').bind(end, orgId)
    : db.prepare('SELECT deployment_id, org_id, size, instances, occurred_at FROM deployment_events WHERE occurred_at < ? ORDER BY deployment_id, occurred_at, id').bind(end)
  ).all<DeploymentEventRow>()).results;
