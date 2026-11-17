import { handleStripeWebhook } from '../../../src/lib/orchard/stripe';
import type { OrchardEnv } from '../../../src/lib/orchard/http';

// POST /api/stripe/webhook — signed Stripe events for hosted Orchard billing.
export function onRequestPost(context: { request: Request; env: OrchardEnv }): Promise<Response> {
  return handleStripeWebhook(context.request, context.env);
}
