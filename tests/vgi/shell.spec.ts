import { test, expect } from '../haybarn-functions/browser/fixtures';
import { wasmVersion } from '../../src/haybarn-functions/data/haybarn-release.mjs';

test('the VGI terminal runs without CDN module imports or blob-relative source maps', async ({ page }) => {
  const moduleRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/npm/') && request.url().includes('+esm')) {
      moduleRequests.push(request.url());
    }
  });
  await page.route('**/+esm', route => route.abort());
  await page.addInitScript(() => {
    // Exercise the real terminal and Arrow decoder with deterministic SQL,
    // independent of the weather service used by the first live example.
    document.addEventListener('DOMContentLoaded', () => {
      const code = document.querySelector('pre[data-language="sql"] code');
      if (code) code.textContent = "SELECT '全角 🚂' AS label, 42 AS answer;";
    });

    // Enable xterm's accessible output so assertions read rendered results.
    Object.defineProperty(window, 'Terminal', {
      configurable: true,
      set(Terminal) {
        Object.defineProperty(window, 'Terminal', {
          configurable: true,
          value: class extends Terminal {
            constructor(options: object) {
              super({ ...options, screenReaderMode: true });
            }
          },
        });
      },
    });

    const probe = window as typeof window & { workerSourceMaps: string[] };
    probe.workerSourceMaps = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob instanceof Blob && blob.type.includes('javascript')) {
        void blob.text().then(source => {
          const map = source.match(/^\/\/[#@]\s*sourceMappingURL=(\S+)/m);
          if (map) probe.workerSourceMaps.push(map[1]);
        });
      }
      return createObjectURL(blob);
    };
  });

  await page.goto('/vgi/');
  await page.locator('.example-try-button').first().click();
  const shell = page.locator('.example-shell').first();
  const output = shell.locator('.xterm-accessibility');
  await expect(output).toContainText(/│\s*全角 🚂\s*│\s*42\s*│/, { timeout: 60_000 });
  await expect(output).toContainText(/1 row.*H >/s);
  await shell.locator('.xterm-helper-textarea').pressSequentially('SELECT 84 AS doubled;');
  await page.keyboard.press('Enter');
  await expect(output).toContainText('doubled');
  await expect(output).toContainText(/│\s*84\s*│/);
  await expect(shell.locator('.example-shell-error')).toHaveCount(0);
  expect(moduleRequests).toEqual([]);
  const maps = await page.evaluate(() => (window as typeof window & { workerSourceMaps: string[] }).workerSourceMaps);
  expect(maps).toEqual([
    `https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/dist/duckdb-browser-eh.worker.js.map`,
  ]);
});
