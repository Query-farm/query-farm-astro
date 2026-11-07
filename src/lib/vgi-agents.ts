/** Shared agent metadata and starting requests for the VGI quickstart. */
export const VGI_SKILLS_REPO = 'https://github.com/Query-farm/vgi-skills';
export const VGI_SKILLS_SOURCE = import.meta.env.PUBLIC_VGI_SKILLS_SOURCE || 'Query-farm/vgi-skills';
const reviewRef = VGI_SKILLS_SOURCE.split('@')[1];
export const vgiSkillsFile = (file: string) => `${VGI_SKILLS_REPO}/blob/${reviewRef || 'main'}/${file}`;

export const VGI_AGENTS = [
  { id: 'codex', name: 'Codex', invocation: '$vgi-worker', directory: '.agents/skills/' },
  { id: 'claude-code', name: 'Claude Code', invocation: '/vgi-worker', directory: '.claude/skills/' },
  { id: 'cursor', name: 'Cursor', invocation: 'Use the vgi-worker skill.', directory: '.cursor/skills/' },
  { id: 'github-copilot', name: 'GitHub Copilot', invocation: 'Use the vgi-worker skill.', directory: '.github/skills/' },
  { id: 'opencode', name: 'OpenCode', invocation: 'Use the vgi-worker skill.', directory: '.opencode/skills/' },
] as const;

export const VGI_AGENT_LANGUAGES = [
  { id: 'csharp', name: 'C#', runtime: '.NET 10', sdk: 'QueryFarm.Vgi', version: '0.23.0' },
  { id: 'go', name: 'Go', runtime: 'Go 1.26+', sdk: 'vgi-go', version: '0.39.0' },
  { id: 'java', name: 'Java', runtime: 'Java 21+', sdk: 'farm.query:vgi', version: '0.46.0' },
  { id: 'python', name: 'Python', runtime: 'Python 3.13+', sdk: 'vgi-python', version: '0.49.0' },
  { id: 'rust', name: 'Rust', runtime: 'Rust 1.97+', sdk: 'vgi', version: '0.49.2' },
  { id: 'typescript', name: 'TypeScript', runtime: 'Node 22.15+ or Bun', sdk: '@query-farm/vgi', version: '0.48.0' },
] as const;

export const VGI_AGENT_REQUESTS = [
  {
    id: 'api', name: 'An API or data service', icon: 'mdi:cloud-outline',
    examples: 'GitHub releases, support tickets, CRM records…',
    prompt: 'Use the vgi-worker skill to connect an API or data service to DuckDB as a SQL catalog, so I can join its records to a local CSV. Ask me which source and language to use, then build and test the worker and show me how to ATTACH and query it.',
  },
  {
    id: 'files', name: 'Data on your computer', icon: 'mdi:folder-image',
    examples: 'Photo metadata you can filter and group.',
    prompt: 'Use the vgi-worker skill to make my photo metadata queryable in DuckDB: file paths, camera models, dates, and GPS coordinates where available. Ask me which folder and language to use. Keep the files unchanged and the data local. Build and test the worker, then show me how to ATTACH and query it.',
  },
  {
    id: 'library', name: 'Code you already use', icon: 'mdi:code-braces',
    examples: 'Your application’s rules, available in SQL.',
    prompt: 'Use the vgi-worker skill to wrap our validation library so I can find invalid records in DuckDB. Ask me which library and language to use, and for examples of valid and invalid inputs. Build and test the worker, then show me how to ATTACH it and query a local CSV.',
  },
] as const;

export const VGI_CUSTOM_REQUEST = 'Use the vgi-worker skill to build a DuckDB integration. Ask me what I want to connect, which language to use, and what results I need. Build and test the worker, then show me how to ATTACH and query it.';
