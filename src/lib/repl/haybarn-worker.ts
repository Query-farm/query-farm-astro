/** Load the CDN worker while keeping its source map relative to the CDN. */
export async function createHaybarnWorker(url: string): Promise<Worker> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load Haybarn worker (${response.status}): ${url}`);
  }

  // Copying a relative sourceMappingURL into a blob makes Safari resolve it
  // against a blob:// URL. Preserve debugging with the original CDN location.
  const source = (await response.text()).replace(
    /^(\/\/[#@]\s*sourceMappingURL=)(\S+)/gm,
    (_, directive: string, map: string) => directive + new URL(map, response.url || url).href,
  );
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const worker = new Worker(blobUrl);
    // WebKit reads the blob asynchronously; keep it until the worker responds.
    const release = () => {
      URL.revokeObjectURL(blobUrl);
      worker.removeEventListener('message', release);
      worker.removeEventListener('error', release);
    };
    worker.addEventListener('message', release);
    worker.addEventListener('error', release);
    return worker;
  } catch (error) {
    URL.revokeObjectURL(blobUrl);
    throw error;
  }
}
