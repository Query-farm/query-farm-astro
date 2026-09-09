import type { APIRoute } from 'astro';
import { snapshots, type Snapshot } from '@haybarn/lib/catalog';
import { indexMarkdown, markdownResponse } from '@haybarn/lib/agent-docs';
export function getStaticPaths() { return snapshots.map(snapshot => ({ params: { release: snapshot.id }, props: { snapshot } })); }
export const GET: APIRoute = ({ props }) => markdownResponse(indexMarkdown(props.snapshot as Snapshot));
