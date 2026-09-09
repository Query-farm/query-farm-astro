import { functionSchema } from '@haybarn/lib/function-schema';
import { jsonResponse } from '@haybarn/lib/agent-docs';
export const GET = () => jsonResponse(functionSchema);
