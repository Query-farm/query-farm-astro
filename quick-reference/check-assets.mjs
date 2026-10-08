#!/usr/bin/env node
import { checkArtifacts } from './artifacts.mjs';

try {
  const snapshot = checkArtifacts();
  console.log(`[quick-reference] ${snapshot.guides.length} PDFs match their sources; directory and bundles verified.`);
} catch (error) {
  console.error(`[quick-reference] ${error.message}\nRun npm run generate:quick-references and include the updated sources, PDFs and manifests together.`);
  process.exitCode = 1;
}
