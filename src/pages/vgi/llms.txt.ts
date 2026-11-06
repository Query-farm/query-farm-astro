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
    '## Build with a coding agent', '',
    'For a new worker, ask the developer to choose Python, TypeScript, Go, Rust, Java, or C# unless they already specified a language. Preserve the language of existing projects.', '',
    `- [Agent quickstart](${origin}/vgi/build-with-an-agent/): Install the portable skill, choose a language, and build and test a worker locally.`,
    '- [VGI skills](https://github.com/Query-farm/vgi-skills): Versioned language recipes, SQL verification helpers, packaging, and fresh-session evaluations.',
    `- [Test a Python worker](${origin}/vgi/docs/python/how-to/testing/)`,
    `- [Test a TypeScript worker](${origin}/vgi/docs/typescript/how-to/testing/)`,
    'Use published SDK versions and matching release examples. The skills verify through stock DuckDB 2.0.0. Configure the Query Farm extension repository, then INSTALL vgi FROM query_farm and LOAD vgi FROM query_farm. Haybarn is also supported.', '',
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
