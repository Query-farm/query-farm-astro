import { agentGuideMarkdown, markdownResponse } from '@haybarn/lib/agent-docs';
export const GET = () => markdownResponse(agentGuideMarkdown());
