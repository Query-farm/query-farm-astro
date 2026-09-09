import type { APIRoute } from 'astro';
import { snapshots, type Snapshot } from '@haybarn/lib/catalog';
import { exportComparison, jsonResponse } from '@haybarn/lib/agent-docs';
export function getStaticPaths() { return snapshots.flatMap(from => snapshots.filter(to => to.id !== from.id).map(to => ({ params: { from: from.id, to: to.id }, props: { from, to } }))); }
export const GET: APIRoute = ({ props }) => jsonResponse(exportComparison(props.from as Snapshot, props.to as Snapshot));
