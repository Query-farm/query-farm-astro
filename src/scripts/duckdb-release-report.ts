import { calendarFigure, releaseFigure, type ReleaseReport } from '../lib/release-report-chart';
import { trackSiteEvent } from '../lib/newsletter-analytics';

type Plotly = {
  newPlot: (el: HTMLElement, data: Record<string, unknown>[], layout: object, config: object) => Promise<unknown>;
  Plots: { resize: (el: HTMLElement) => void };
};
const root = document.getElementById('release-report');
const source = document.getElementById('release-report-data');
if (root && source?.textContent) {
  const report: ReleaseReport = JSON.parse(source.textContent);
  let library: Promise<Plotly> | undefined;
  const drawn: HTMLElement[] = [];
  function loadPlotly() {
    return library ??= new Promise<Plotly>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/research/duckdb-2-release-activity/plotly.min.js'; script.async = true;
      script.onload = () => {
        const plotly = (window as Window & { Plotly?: Plotly }).Plotly;
        if (plotly) resolve(plotly); else reject(new Error('Chart library unavailable'));
      };
      script.onerror = () => reject(new Error('Chart library unavailable'));
      document.head.append(script);
    });
  }
  async function enhance(figure: HTMLElement) {
    const chart = figure.querySelector<HTMLElement>('.report-plot')!;
    const fallback = figure.querySelector<HTMLElement>('.report-fallback')!;
    try {
      const plotly = await loadPlotly();
      const metric = figure.dataset.reportChart!;
      const config = metric === 'calendar' ? calendarFigure(report)
        : releaseFigure(report, metric, 'prerun', 'trailing', figure.clientWidth < 600);
      chart.hidden = false;
      await plotly.newPlot(chart, config.data, config.layout, config.config);
      fallback.hidden = true;
      drawn.push(chart);
    } catch {
      // The full report, static figures, tables and downloads already work.
      chart.hidden = true; fallback.hidden = false;
    }
  }
  const figures = root.querySelectorAll<HTMLElement>('[data-report-chart]');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target); void enhance(entry.target as HTMLElement);
      }
    }, { rootMargin: '250px' });
    figures.forEach(figure => observer.observe(figure));
  } else figures.forEach(figure => { void enhance(figure); });
  window.addEventListener('resize', () => {
    if (library) void library.then(plotly => drawn.forEach(chart => plotly.Plots.resize(chart))).catch(() => {});
  });
  root.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a');
    if (!link) return;
    const href = new URL(link.href);
    if (href.pathname === '/company/schedule' || href.protocol === 'mailto:') {
      trackSiteEvent('consultation_click', { content_id: report.slug,
        placement: link.closest<HTMLElement>('[data-cta-placement]')?.dataset.ctaPlacement ?? 'report',
        method: href.protocol === 'mailto:' ? 'email' : 'schedule' });
    }
  });
}
