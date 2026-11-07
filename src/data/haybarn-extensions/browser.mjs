import { wasmVersion } from '../../haybarn-functions/data/haybarn-release.mjs';

// The site's base bundle loads wasm_eh artifacts for its engine release.
// A threads-only or historical WASM build cannot run in this session.
export function supportsBrowserSession(availability, runtimeVersion = wasmVersion) {
  const engineVersion = runtimeVersion.split('-')[0];
  return availability.some(artifact => artifact.platform === 'wasm_eh' && artifact.version === engineVersion);
}

// Reproduced by real browser LOAD checks with rc11 and rc12 on 2026-11-06.
// Scope these to the tested engines and artifact ETag so refreshed builds
// are checked again. Both packages contain the same base WASM binary.
// anofox_similarity fails during telemetry initialization; sitemap fails
// dynamic linking; stats_duck imports a function with an incompatible type.
const failedBuilds = {
  anofox_similarity: 'W/"0e825d8cdb699751390cf954b3a8b3e4"',
  sitemap: 'W/"16d7c81014269657e39142c634ba26be"',
  stats_duck: 'W/"4b40e8283b9b37da911903451f1c7c53"',
};

export function browserSessionIssue(extension, runtimeVersion = wasmVersion) {
  if (!['2.0.0-rc11', '2.0.0-rc12'].includes(runtimeVersion)) return undefined;
  const etag = failedBuilds[extension.name];
  // The CDN uses a weak validator for compressed responses and a strong one
  // for HEAD, retaining the same content identifier.
  if (etag && extension.availability.some(artifact => artifact.version === '2.0.0' && artifact.platform === 'wasm_eh' && artifact.etag?.replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
    return 'This published WASM build cannot load in the current browser session. Use a native Haybarn session for now.';
  }
  return undefined;
}
