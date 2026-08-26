// JSON endpoint serving the per-extension function data. Two top-level keys:
//
//   entries: every function's full record (id, name, params, examples, ...)
//            keyed by id and consumed by the client renderer for lazy cards.
//   nameToId: map from function name → first-occurrence id, for resolving
//             relatedFunctions strings (which authors give as names).
//
// The client only walks `entries` for the cards it expands — `relatedFunctions`
// are resolved on demand via `nameToId` and `entries[id].description`, so we
// don't have to ship redundant {name, description} structs alongside every
// related list.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getExtensionData } from '../../../../data/extension-loader';
import { publicExtensions } from '../../../../data/extensions';

export const getStaticPaths: GetStaticPaths = () =>
  publicExtensions.map((e) => ({ params: { slug: e.id } }));

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string;
  const data = await getExtensionData(slug);
  if (!data || !data.functions) {
    return new Response('{"entries":{},"nameToId":{}}',
      { headers: { 'content-type': 'application/json' } });
  }

  const entries: Record<string, any> = {};
  const nameToId: Record<string, string> = {};
  for (const fn of data.functions) {
    entries[fn.id] = {
      id:              fn.id,
      name:            fn.name,
      type:            fn.type,
      categories:      fn.categories,
      returnType:      fn.returnType,
      returnTypeUnion: (fn as any).returnTypeUnion,
      forms:           (fn as any).forms,
      parameters:      fn.parameters,
      returns:         fn.returns,
      returnsTable:    fn.returnsTable,
      returnsTableDynamic: fn.returnsTableDynamic,
      description:     fn.description,
      examples:        fn.examples,
      options:         fn.options,
      tags:            fn.tags,
      relatedNames:    fn.relatedFunctions ?? [],
    };
    if (!(fn.name in nameToId)) nameToId[fn.name] = fn.id;
  }

  return new Response(JSON.stringify({ entries, nameToId }), {
    headers: { 'content-type': 'application/json' },
  });
};
