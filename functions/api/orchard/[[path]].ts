import { handleOrchardApi } from '../../../src/lib/orchard/api';
import type { OrchardEnv } from '../../../src/lib/orchard/http';

// /api/orchard/* — the hosted Orchard console API. Routes and docs live in
// src/lib/orchard/api.ts; this file only hands it the request and bindings.
export function onRequest(context: { request: Request; env: OrchardEnv }): Promise<Response> {
  return handleOrchardApi(context.request, context.env);
}
