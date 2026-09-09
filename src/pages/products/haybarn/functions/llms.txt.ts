import { discoveryMarkdown } from '@haybarn/lib/agent-docs';
export const GET = () => new Response(discoveryMarkdown(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
