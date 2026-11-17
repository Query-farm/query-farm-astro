import { handleLogout } from '../../../src/lib/orchard/auth';
import type { OrchardEnv } from '../../../src/lib/orchard/http';

// GET or POST /api/auth/logout — clear the session and end the WorkOS session.
export function onRequest(context: { request: Request; env: OrchardEnv }): Promise<Response> {
  return handleLogout(context.request, context.env);
}
