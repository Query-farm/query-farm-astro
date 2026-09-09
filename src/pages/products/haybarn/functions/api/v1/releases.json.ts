import { exportManifest, jsonResponse } from '@haybarn/lib/agent-docs';
export const GET = () => jsonResponse(exportManifest());
