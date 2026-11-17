import { handleLogin } from '../../../src/lib/orchard/auth';
import type { OrchardEnv } from '../../../src/lib/orchard/http';

// GET /api/auth/login — start WorkOS AuthKit sign-in. See src/lib/orchard/auth.ts.
export function onRequestGet(context: { request: Request; env: OrchardEnv }): Promise<Response> {
  return handleLogin(context.request, context.env);
}
