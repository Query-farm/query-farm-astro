import captured from '../data/upstream-docs.json';
import type { FunctionDoc } from './catalog';

type Link = { title: string; url: string };
const entries = captured.functions as Record<string, Link[]>;
const topic = (path: string) => captured.pages.find(page => new URL(page.url).pathname.replace(/\.html$/, '').endsWith(path));

export function documentationFor(fn: FunctionDoc): Link[] {
  let preferred: Link | undefined;
  if (/^(strftime|strptime|try_strptime)$/.test(fn.name)) preferred = topic('/sql/functions/dateformat');
  else if (/^(read_csv|sniff_csv)/.test(fn.name)) preferred = topic('/data/csv/overview');
  else if (/json/i.test(fn.name)) preferred = topic('/data/json/json_functions');
  else if (/parquet/.test(fn.name)) preferred = topic('/data/parquet/overview');
  const fallback: Record<string, string> = {
    text: '/sql/functions/text', numeric: '/sql/functions/numeric', dates: '/sql/functions/date',
    lists: '/sql/functions/list', nested: '/sql/functions/nested', json: '/data/json/json_functions',
    aggregate: '/sql/functions/aggregates', files: '/sql/functions/utility', system: '/sql/functions/utility', operators: '/sql/functions/overview',
  };
  const links = [...(preferred ? [preferred] : []), ...(entries[fn.name] ?? [])];
  if (!links.length) { const page = topic(fallback[fn.category]); if (page) links.push(page); }
  const seen = new Set<string>();
  return links.filter(link => { const page = link.url.split('#')[0]; if (seen.has(page)) return false; seen.add(page); return true; }).slice(0, 3);
}
