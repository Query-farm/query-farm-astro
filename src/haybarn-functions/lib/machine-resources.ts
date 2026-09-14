import { snapshots, defaultSnapshot, getFunctions, type Snapshot } from './catalog';
import { exportComparison, exportFunction, exportIndex, functionMarkdown, indexMarkdown } from './agent-docs';
import generatedSearchRecords from '../data/search.generated.json';

const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';
const MACHINE_ROOT = '/products/haybarn/functions/';
const API_ROOT = `${MACHINE_ROOT}api/v1/`;

export interface RenderedResource {
  body: string;
  status: number;
  headers: Record<string, string>;
}

interface SearchRecord {
  snapshotId: string;
  release: string;
  name: string;
  description: string;
  url: string;
  content: string;
}

const searchRecords = generatedSearchRecords as SearchRecord[];

function json(value: unknown, status = 200): RenderedResource {
  return {
    body: `${JSON.stringify(value, null, 2)}\n`,
    status,
    headers: {
      'Cache-Control': status === 200 ? 'public, max-age=300, s-maxage=3600' : 'no-store',
      'Content-Signal': CONTENT_SIGNAL,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

function markdown(body: string): RenderedResource {
  return {
    body,
    status: 200,
    headers: {
      // Release IDs pin engine data, but editorial examples can still improve
      // between site deploys, so do not mark these responses immutable.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Content-Signal': CONTENT_SIGNAL,
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

function snapshotById(id: string) {
  return snapshots.find(snapshot => snapshot.id === id);
}

function functionBySlug(snapshot: Snapshot, slug: string) {
  return getFunctions(snapshot).find(fn => fn.slug === slug);
}

function notFound(resource: string) {
  return json({ error: 'not_found', resource }, 404);
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function excerpt(content: string, term: string) {
  const at = content.indexOf(term);
  if (at < 0) return '';
  const start = Math.max(0, at - 90);
  const end = Math.min(content.length, at + term.length + 140);
  const before = escapeHtml(content.slice(start, at));
  const match = escapeHtml(content.slice(at, at + term.length));
  const after = escapeHtml(content.slice(at + term.length, end));
  return `${start ? '…' : ''}${before}<mark>${match}</mark>${after}${end < content.length ? '…' : ''}`;
}

function search(url: URL) {
  const rawQuery = (url.searchParams.get('q') ?? '').trim();
  const normalized = rawQuery.replace(/^"|"$/g, '').toLocaleLowerCase('en-US');
  if (!normalized) return json({ query: rawQuery, total: 0, results: [] });
  const terms = normalized.split(/\s+/).filter(Boolean);
  const release = url.searchParams.get('release') ?? defaultSnapshot.id;
  const selected = release === 'all' ? new Set(snapshots.map(snapshot => snapshot.id)) : new Set([release]);
  if (release !== 'all' && !snapshotById(release)) return json({ error: 'unknown_release', release }, 400);

  const ranked = searchRecords.flatMap(record => {
    if (!selected.has(record.snapshotId)) return [];
    if (!terms.every(term => record.content.includes(term))) return [];
    const name = record.name.toLocaleLowerCase('en-US');
    let score = terms.reduce((total, term) => total + (name === term ? 120 : name.startsWith(term) ? 80 : name.includes(term) ? 50 : 5), 0);
    if (record.description.toLocaleLowerCase('en-US').includes(normalized)) score += 25;
    if (record.content.includes(normalized)) score += 15;
    return [{ record, score }];
  }).sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name) || a.record.snapshotId.localeCompare(b.record.snapshotId));

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  return json({
    query: rawQuery,
    release,
    total: ranked.length,
    results: ranked.slice(0, limit).map(({ record }) => ({
      url: record.url,
      excerpt: excerpt(record.content, terms.find(term => record.content.includes(term)) ?? normalized),
      meta: { title: record.name, kind: 'Function', release: record.release },
    })),
  });
}

/** Render a machine route without Cloudflare globals, for unit and build tests. */
export function renderMachineResource(input: string | URL): RenderedResource | null {
  const url = typeof input === 'string' ? new URL(input, 'https://query.farm') : input;
  const path = decodeURIComponent(url.pathname);

  if (path === `${API_ROOT}search.json`) return search(url);

  let match = path.match(/^\/products\/haybarn\/functions\/api\/v1\/([^/]+)\/functions\.json$/);
  if (match) {
    const snapshot = snapshotById(match[1]);
    return snapshot ? json(exportIndex(snapshot)) : notFound(path);
  }

  match = path.match(/^\/products\/haybarn\/functions\/api\/v1\/([^/]+)\/functions\/([^/]+)\.json$/);
  if (match) {
    const snapshot = snapshotById(match[1]);
    if (!snapshot) return notFound(path);
    const fn = functionBySlug(snapshot, match[2]);
    return fn ? json(exportFunction(snapshot, fn)) : notFound(path);
  }

  match = path.match(/^\/products\/haybarn\/functions\/api\/v1\/compare\/([^/]+)\/([^/]+)\.json$/);
  if (match) {
    const from = snapshotById(match[1]);
    const to = snapshotById(match[2]);
    return from && to && from.id !== to.id ? json(exportComparison(from, to)) : notFound(path);
  }

  match = path.match(/^\/products\/haybarn\/functions\/releases\/([^/]+)\/index\.md$/);
  if (match) {
    const snapshot = snapshotById(match[1]);
    return snapshot ? markdown(indexMarkdown(snapshot)) : notFound(path);
  }

  match = path.match(/^\/products\/haybarn\/functions\/releases\/([^/]+)\/([^/]+)\/index\.md$/);
  if (match) {
    const snapshot = snapshotById(match[1]);
    if (!snapshot) return notFound(path);
    const fn = functionBySlug(snapshot, match[2]);
    return fn ? markdown(functionMarkdown(snapshot, fn)) : notFound(path);
  }

  return null;
}

/** Shared Pages Function handler for the exact machine-resource routes. */
export function onRequestMachineResource(context: { request: Request }): Response {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Content-Signal': CONTENT_SIGNAL },
    });
  }

  let resource: RenderedResource | null;
  try {
    resource = renderMachineResource(request.url);
  } catch {
    resource = json({ error: 'bad_request' }, 400);
  }
  if (!resource) resource = notFound(new URL(request.url).pathname);
  return new Response(request.method === 'HEAD' ? null : resource.body, {
    status: resource.status,
    headers: resource.headers,
  });
}
