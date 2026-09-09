import type { APIRoute } from 'astro';
import { snapshots, getFunctions, type Snapshot, type FunctionDoc } from '@haybarn/lib/catalog';
import { functionMarkdown, markdownResponse } from '@haybarn/lib/agent-docs';
export function getStaticPaths() { return snapshots.flatMap(snapshot => getFunctions(snapshot).map(fn => ({ params: { release: snapshot.id, slug: fn.slug }, props: { snapshot, fn } }))); }
export const GET: APIRoute = ({ props }) => markdownResponse(functionMarkdown(props.snapshot as Snapshot, props.fn as FunctionDoc));
