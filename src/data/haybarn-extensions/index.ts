import snapshot from './catalog.generated.json';
import importedDocs from './docs.generated.json';
import sheetreaderInventory from './inventories/sheetreader.json';
import gsheetsInventory from './inventories/gsheets.json';
import { categories, categoryIds, searchAliases } from './taxonomy.mjs';
import { publicExtensions } from '../extensions';

export { categories };
// Discovery follows the current published release, including when reading a
// snapshot that still contains availability from earlier releases.
export const catalog = {
  ...snapshot,
  releases: snapshot.releases.filter(release => release.version === snapshot.latestVersion),
  extensions: snapshot.extensions
    .map(entry => ({ ...entry, availability: entry.availability.filter(item => item.version === snapshot.latestVersion) }))
    .filter(entry => entry.availability.length > 0),
};
export const directoryPath = '/products/haybarn/extensions';
export const categoryPath = (id: string) => `${directoryPath}/category/${id}`;
export const prototypes = {
  sheetreader: { name: 'SheetReader', icon: 'file-xls', docsUrl: 'https://github.com/polydbms/sheetreader-duckdb#usage--parameters', inventory: sheetreaderInventory, docs: importedDocs.sheetreader },
  gsheets: { name: 'Google Sheets', icon: 'table', docsUrl: 'https://duckdb-gsheets.com', inventory: gsheetsInventory, docs: importedDocs.gsheets },
};
export type PrototypeName = keyof typeof prototypes;
export type Availability = { version: string; platform: string; bytes: number; etag: string | null; modifiedAt: string | null };
export const platformGroups = [
  { id: 'linux', name: 'Linux', icon: 'simple-icons:linux' },
  { id: 'osx', name: 'macOS', icon: 'simple-icons:apple' },
  { id: 'windows', name: 'Windows', icon: 'ph:windows-logo' },
  { id: 'wasm', name: 'WASM', icon: 'simple-icons:webassembly' },
];
export const platformLabel = (platform: string) => ({
  linux_amd64: 'Linux · x86-64', linux_arm64: 'Linux · ARM64',
  linux_amd64_musl: 'Linux musl · x86-64', linux_arm64_musl: 'Linux musl · ARM64',
  osx_amd64: 'macOS · Intel', osx_arm64: 'macOS · Apple Silicon',
  windows_amd64: 'Windows · x86-64', windows_arm64: 'Windows · ARM64', windows_amd64_mingw: 'Windows · MinGW',
  wasm_eh: 'WASM · exception handling', wasm_mvp: 'WASM · MVP', wasm_threads: 'WASM · threads',
}[platform] ?? platform);

const queryFarmPages = new Map(publicExtensions.map(extension => [extension.id, extension]));
const plain = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*#]/g, '').replace(/\s+/g, ' ').trim();

export const extensions = catalog.extensions.map(entry => {
  const prototype = prototypes[entry.name as PrototypeName];
  const queryFarm = /^(query-farm|query-farm-haybarn)\//i.test(entry.repo.github ?? '');
  const existing = queryFarm ? queryFarmPages.get(entry.name) : undefined;
  const categoryList = categoryIds(entry.name);
  const aliases = (searchAliases as Record<string, string[]>)[entry.name] ?? [];
  const repository = `https://github.com/${entry.repo.github}`;
  const linkedDocs = /\[[^\]]*(?:documentation|docs)[^\]]*\]\((https?:\/\/[^)]+)\)/i.exec(String(entry.docs.extended_description ?? ''))?.[1];
  const href = existing ? `/products/extensions/${entry.name}` : prototype ? `${directoryPath}/${entry.name}` : linkedDocs || repository;
  const name = existing?.name || prototype?.name || entry.name;
  return {
    ...entry, name: entry.name, displayName: name, description: plain(entry.description),
    publisher: queryFarm ? 'Query Farm' : entry.repo.github.split('/')[0], queryFarm,
    categories: categoryList, aliases,
    icon: existing?.icon || prototype?.icon || categories.find(c => c.id === categoryList[0])?.icon || 'puzzle-piece',
    href, external: !href.startsWith('/'), repository,
    searchText: plain([entry.name, name, entry.description, ...aliases, ...categoryList.map(id => categories.find(c => c.id === id)?.name), prototype?.inventory.functions.map(fn => fn.function_name).join(' ')].join(' ')),
    searchContent: plain([entry.description, entry.docs.hello_world, entry.docs.extended_description, ...aliases, ...(prototype?.inventory.functions.map(fn => `${fn.function_name} ${fn.parameters.join(' ')} ${fn.description ?? ''}`) ?? [])].join(' ')),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

export type CommunityExtension = typeof extensions[number];
export function matchesAvailability(availability: Availability[], version = '', platform = '') {
  return availability.some(item => (!version || item.version === version) && (!platform || item.platform === platform));
}

// Retain every confirmed extension even when a new catalog entry has not yet
// been categorized. The directory's default view always includes it.
export const uncategorized = extensions.filter(extension => !extension.categories.length);
