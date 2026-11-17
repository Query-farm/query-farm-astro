import { handleCallback } from '../../../src/lib/orchard/auth';
import type { OrchardEnv } from '../../../src/lib/orchard/http';

// GET /api/auth/callback — WorkOS redirects here with the authorization code.
export function onRequestGet(context: { request: Request; env: OrchardEnv }): Promise<Response> {
  return handleCallback(context.request, context.env);
}
