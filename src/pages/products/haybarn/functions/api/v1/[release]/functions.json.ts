import type { APIRoute } from 'astro';
import { snapshots, type Snapshot } from '@haybarn/lib/catalog';
import { exportIndex, jsonResponse } from '@haybarn/lib/agent-docs';
export function getStaticPaths() { return snapshots.map(snapshot => ({ params: { release: snapshot.id }, props: { snapshot } })); }
export const GET: APIRoute = ({ props }) => jsonResponse(exportIndex(props.snapshot as Snapshot));
