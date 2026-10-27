import report from '../data/research/duckdb-2-release-activity.json';
export { report };
export const assets = '/research/duckdb-2-release-activity';
export const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const through = date(report.through);
export const groups = report.packageGroups;
export const core = report.packages.find(p => p.repo === 'duckdb')!;
export const clients = groups.find(g => g.id === 'clients')!;
export const recentCore = report.packageGroupsRecent.find(g => g.id === 'core')!;
export const recentClients = report.packageGroupsRecent.find(g => g.id === 'clients')!;
export const newReporters = report.reporterBreadth['2.0.0'].new;
export const outside = report.counts.issuesOpened - core.counts['2.0.0'].actual;
export const ratio = (id: keyof typeof report.windows, version = '2.0.0', window: 'post' | 'runup' = 'post', digits = 1, baseline: 'prerun' | 'recent' = 'prerun') => {
  const values = report.windows[id][baseline] as Record<string, { post: number; runup: number }>;
  return `${values[version][window].toFixed(digits)}×`;
};
