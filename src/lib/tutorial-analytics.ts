type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void };

/** Fixed content IDs only. Never collect SQL, query results, or error messages. */
export function installTutorialTracking(article: HTMLElement, post: string): () => void {
  const emit = (event: string, params: Record<string, string | number>) =>
    (window as AnalyticsWindow).gtag?.('event', event, { post, content_type: 'tutorial', ...params });
  const click = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const download = event.target.closest<HTMLElement>('[data-tutorial-download]');
    if (download) emit('tutorial_download', { resource: download.dataset.tutorialDownload ?? 'walkthrough' });
    const copy = event.target.closest('.copy-button');
    const example = copy?.closest<HTMLElement>('[data-article-example]');
    if (example) emit('tutorial_copy', { example_id: example.dataset.articleExample ?? '' });
  };
  article.addEventListener('click', click);

  // Read progress is qualified by visible time. Reaching the end quickly
  // does not imply completion, and a hidden tab does not accrue time.
  let visibleMs = 0;
  let previous = performance.now();
  let wasVisible = document.visibilityState === 'visible';
  const sent = new Set<number>();
  const tick = () => {
    const now = performance.now();
    if (wasVisible) visibleMs += now - previous;
    previous = now;
    wasVisible = document.visibilityState === 'visible';
    if (!wasVisible) return;
    const body = article.querySelector<HTMLElement>('.qf-prose');
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight - rect.top) / rect.height));
    for (const [percent, seconds] of [[25, 10], [50, 20], [90, 45]]) {
      if (!sent.has(percent) && progress >= percent / 100 && visibleMs >= seconds * 1000) {
        // Do not consume events while analytics is unavailable (dev / opt-out).
        if (!(window as AnalyticsWindow).gtag) continue;
        sent.add(percent);
        emit('tutorial_read_progress', { percent });
      }
    }
  };
  const timer = window.setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  const dispose = () => {
    clearInterval(timer);
    article.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('pagehide', dispose);
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
