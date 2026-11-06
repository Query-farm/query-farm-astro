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
  { id: 'github', name: 'GitHub releases + local projects', description: 'Connect a live API and join its rows to your local project inventory.', request: 'Expose the public GitHub releases API as a typed table function. Follow pagination with an explicit page limit, handle empty results and upstream errors, and use request timeouts. Add a clearly labeled sample project inventory CSV and a query joining its installed tags to the most recently published stable release in the fetched results. Report differing tags; do not claim every difference is a safe upgrade. Add deterministic HTTP fixtures and run a live read-only API query.' },
  { id: 'files', name: 'Local photos as queryable metadata', description: 'Gather file and EXIF metadata from a folder you choose.', request: 'Expose metadata from a local folder of photos as a SQL table: path, file size, camera model, date taken, and GPS coordinates when present. Ask me which folder to use. Use a maintained metadata library; leave files unchanged, keep all data local, and define symlink and recursion behavior. Handle missing metadata and corrupt files. Test with small generated fixtures and verify filtering and grouping through DuckDB.' },
  { id: 'api', name: 'A service + your business data', description: 'Join support tickets, CRM records, or another service to local data.', request: 'Expose a service API I choose as a typed SQL table function so I can join its records to a local CSV. Ask me for its URL or specification, the desired fields, and authentication requirements. Handle pagination, empty results, rate limits, and upstream errors. Use deterministic fixtures for tests and keep credentials outside source code. Start with read-only operations.' },
  { id: 'library', name: 'Your library inside SQL', description: 'Use the same validation or calculation code in your queries.', request: 'Expose an existing library function I choose as a typed SQL function. Ask which package or source function to wrap and for representative inputs and expected results. Reuse its implementation, preserve its documented semantics, and define NULL and error behavior. Add a query applying it to a column of local data.' },
  { id: 'slugify', name: 'Smallest example: slugify', description: 'A small function for inspecting the generated source and tests.', request: 'Expose demo.main.slugify(VARCHAR) as a SQL function. Lowercase text, transliterate accented Latin characters to ASCII, replace punctuation and whitespace runs with a hyphen, and preserve SQL NULL.' },
] as const;

export function workerPrompt(language: string, recipe: string, agent: string) {
  const selectedLanguage = VGI_AGENT_LANGUAGES.find(item => item.id === language);
  const selectedRecipe = VGI_AGENT_RECIPES.find(item => item.id === recipe);
  const selectedAgent = VGI_AGENTS.find(item => item.id === agent);
  if (!selectedLanguage || !selectedRecipe || !selectedAgent) return '';
  return `${selectedAgent.invocation}\n\nBuild a VGI worker in ${selectedLanguage.name}.\n\n${selectedRecipe.request}\n\nUse published SDK dependencies and pin the versions. Run the worker locally through stock DuckDB 2.0.0 with VGI from query_farm. Add repeatable tests for representative values, nulls, empty input, and multiple batches where applicable. Verify the actual SQL results and fix failures caused by the implementation.\n\nLeave the source, dependency configuration, tests, and vgi-worker.json in the project. Give me the exact ATTACH and SELECT statements, commands you ran, and their results. Keep this local; I will choose how to distribute it later.`;
}
