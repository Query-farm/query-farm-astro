import {tutorialFixtures} from './tutorial-fixtures';
import type { BlogWasmExamples } from './blog-wasm-examples';

const examples: Record<string, BlogWasmExamples> = Object.fromEntries(
  tutorialFixtures.filter(tutorial => tutorial.examples.some(example => example.browser !== false)).map(tutorial => [tutorial.slug, {
    extensionName: tutorial.extension,
    installSource: tutorial.extension === 'DuckDB' ? 'builtin' : 'community',
    setupSql: tutorial.setup,
    controls: 'toolbar',
    codeBlockSelector: '.tutorial-example pre[data-language="sql"]',
  }]),
);
export const tutorialWasmExamples = (slug: string): BlogWasmExamples | undefined => examples[slug];
