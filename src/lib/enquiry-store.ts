/** Minimal structural D1 types keep this code usable in Pages and Node tests. */
export interface EnquiryStatement {
  bind(...values: (string | number | null)[]): EnquiryStatement;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
}
export interface EnquiryDatabase {
  prepare(sql: string): EnquiryStatement;
  batch(statements: EnquiryStatement[]): Promise<{ success: boolean; meta?: { changes?: number } }[]>;
}

export interface EnquiryReceipt {
  enquiryId: string;
  resendId: string;
  acceptedAt: string;
}

export async function saveEnquiryReceipt(db: EnquiryDatabase, receipt: EnquiryReceipt): Promise<void> {
  const result = await db.prepare(`
    INSERT INTO enquiry_messages (enquiry_id, resend_id, accepted_at)
    VALUES (?, ?, ?) ON CONFLICT(resend_id) DO NOTHING
  `).bind(receipt.enquiryId, receipt.resendId, receipt.acceptedAt).run();
  if (!result.success) throw new Error('Enquiry receipt storage failed');
}

export const DELIVERY_EVENTS = [
  'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
  'email.failed', 'email.suppressed', 'email.complained',
] as const;
export type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];

export async function saveDeliveryEvent(db: EnquiryDatabase, event: EnquiryReceipt & {
  webhookId: string; type: DeliveryEvent; occurredAt: string; receivedAt: string;
}): Promise<boolean> {
  // A webhook may beat the send response. Signed tags reconstruct its receipt.
  // D1 batches are transactions: acknowledge only after both records persist.
  const results = await db.batch([
    db.prepare(`INSERT INTO enquiry_messages (enquiry_id, resend_id, accepted_at)
      VALUES (?, ?, ?) ON CONFLICT(resend_id) DO NOTHING`)
      .bind(event.enquiryId, event.resendId, event.acceptedAt),
    db.prepare(`INSERT INTO enquiry_delivery_events
      (webhook_id, resend_id, event_type, occurred_at, received_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(webhook_id) DO NOTHING`)
      .bind(event.webhookId, event.resendId, event.type, event.occurredAt, event.receivedAt),
  ]);
  if (results.some(result => !result.success)) throw new Error('Delivery event storage failed');
  return (results[1]?.meta?.changes ?? 0) > 0;
}
