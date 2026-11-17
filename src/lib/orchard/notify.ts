// Emails to the Query.Farm team about hosted Orchard: new sign-ups (leads)
// and deployment requests. Same Resend pattern as src/lib/enquiry.ts. A failed
// email never fails the user's action; it is logged and the D1 row remains
// the record.

import { log, type Fetch, type OrchardEnv } from './http';

export interface TeamEmail {
  subject: string;
  lines: string[];
  replyTo?: string;
  tag: string;
}

/** Sends to ORCHARD_NOTIFY_TO. Returns the Resend id, or null if not sent. */
export async function notifyTeam(env: OrchardEnv, email: TeamEmail, fetchImpl: Fetch): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    log('warn', 'orchard_notify_skipped', { reason: 'configuration', tag: email.tag });
    return null;
  }
  let status: number | undefined;
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.ORCHARD_NOTIFY_FROM || 'Query.Farm Orchard <website@query.farm>',
        to: [env.ORCHARD_NOTIFY_TO || 'hello@query.farm'],
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        subject: email.subject,
        text: [...email.lines, '', '— Sent by the hosted Orchard console on query.farm.'].join('\n'),
        tags: [{ name: 'source', value: 'orchard' }, { name: 'kind', value: email.tag }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    status = response.status;
    if (!response.ok) throw new Error(`Resend answered ${response.status}`);
    const result = await response.json() as { id?: unknown };
    return typeof result.id === 'string' ? result.id : null;
  } catch {
    log('error', 'orchard_notify_failed', { tag: email.tag, provider_status: status });
    return null;
  }
}
