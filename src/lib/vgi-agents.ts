/** Shared copy for the human quickstart and its portable agent prompt. */
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

export const VGI_AGENT_RECIPES = [
  { id: 'slugify', name: 'A library as SQL', description: 'Turn text into URL slugs. Small, local, and easy to verify.', request: 'Expose demo.main.slugify(VARCHAR) as a SQL function. Lowercase text, transliterate accented Latin characters to ASCII, replace runs of punctuation or whitespace with a hyphen, and trim leading/trailing hyphens. Preserve SQL NULL.' },
  { id: 'api', name: 'An API as a table', description: 'Wrap an API you choose, including pagination and fixture tests.', request: 'Expose an API I choose as a typed SQL table function. Ask me for its URL or specification and authentication requirements. Handle pagination, empty results, and upstream errors. Use deterministic fixtures for tests and keep credentials outside source code.' },
  { id: 'catalog', name: 'A dataset as a catalog', description: 'Make your data discoverable as tables, columns, and functions.', request: 'Expose a dataset I choose as a discoverable SQL catalog with useful table and column names, types, and descriptions. Ask me for the dataset location and desired transformations. Verify discovery through information_schema and representative SQL queries.' },
] as const;

export function workerPrompt(language: string, recipe: string, agent: string) {
  const selectedLanguage = VGI_AGENT_LANGUAGES.find(item => item.id === language);
  const selectedRecipe = VGI_AGENT_RECIPES.find(item => item.id === recipe);
  const selectedAgent = VGI_AGENTS.find(item => item.id === agent);
  if (!selectedLanguage || !selectedRecipe || !selectedAgent) return '';
  return `${selectedAgent.invocation}\n\nBuild a VGI worker in ${selectedLanguage.name}.\n\n${selectedRecipe.request}\n\nUse published SDK dependencies and pin the versions. Run the worker locally through stock DuckDB 2.0.0 with VGI from query_farm. Add repeatable tests for representative values, nulls, empty input, and multiple batches where applicable. Verify the actual SQL results and fix failures caused by the implementation.\n\nLeave the source, dependency configuration, tests, and vgi-worker.json in the project. Give me the exact ATTACH and SELECT statements, commands you ran, and their results. Keep this local; I will choose how to distribute it later.`;
}
