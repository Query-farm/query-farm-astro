import capture from '../data/runnable-examples.json';
import { wasmVersion } from '../data/settings';

if (capture.runtime.packageVersion !== wasmVersion) throw new Error(`Examples are from Haybarn ${capture.runtime.packageVersion}; run npm run refresh:haybarn to verify them with ${wasmVersion}.`);
const byFunction = new Map<string, typeof capture.examples>();
for (const example of capture.examples) {
  const examples = byFunction.get(example.function) ?? [];
  examples.push(example);
  byFunction.set(example.function, examples);
}
export function runnableExamplesFor(name: string) { return byFunction.get(name) ?? []; }
export function exampleSource(source: string) {
  return source === 'engine-catalog' ? 'Engine example' : source === 'catalog-with-sample-data' ? 'Engine example with sample data' : 'Guide example';
}
