import { getCollection } from 'astro:content';
import { CONCEPTS, LANGUAGES } from '../../lib/vgi-docs';

const origin = 'https://query.farm';

function description(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export async function GET() {
  const docs = (await getCollection('docs'))
    .filter(entry => entry.id === 'vgi/docs' || entry.id.startsWith('vgi/docs/'));
  const byId = new Map(docs.map(entry => [entry.id, entry]));
  const sections = [CONCEPTS, ...LANGUAGES];
  const lines = [
    '# VGI documentation', '',
    '> Protocol concepts and implementation documentation for building Vector Gateway Interface workers and clients.', '',
    `- [VGI overview](${origin}/vgi/)`,
    `- [Documentation home](${origin}/vgi/docs/)`, '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.name}`, '', section.blurb, '');
    const prefix = `vgi/docs/${section.slug}`;
    const entries = docs
      .filter(entry => entry.id === prefix || entry.id.startsWith(`${prefix}/`))
      .sort((a, b) => a.id === prefix ? -1 : b.id === prefix ? 1 : a.id.localeCompare(b.id));
    for (const entry of entries) {
      const title = description(entry.data.title) || entry.id.split('/').at(-1)!;
      const summary = description(entry.data.description);
      lines.push(`- [${title}](${origin}/${entry.id}/)${summary ? `: ${summary}` : ''}`);
    }
    lines.push('');
  }

  const root = byId.get('vgi/docs');
  if (root) lines.splice(6, 0, `- [${description(root.data.title) || 'VGI documentation'}](${origin}/vgi/docs/): ${description(root.data.description)}`, '');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
