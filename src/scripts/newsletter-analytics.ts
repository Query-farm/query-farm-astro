import { newsletterEvent, newsletterSource, trackSiteEvent } from '../lib/newsletter-analytics';

const lastSubmission = new WeakMap<HTMLFormElement, number>();

document.addEventListener('submit', event => {
  const form = event.target;
  if (event.defaultPrevented || !(form instanceof HTMLFormElement) || !form.matches('[data-newsletter-form]') || !form.checkValidity()) return;
  const now = Date.now();
  if (now - (lastSubmission.get(form) ?? 0) < 1500) return;
  lastSubmission.set(form, now);
  const source = form.dataset.newsletterSource === 'duckdb-2-release-activity'
    ? form.dataset.newsletterSource : newsletterSource(location.pathname, location.search);
  const params = newsletterEvent(form.dataset.newsletterPlacement ?? 'site', source);
  trackSiteEvent('newsletter_submit', params);
  const metadata = form.querySelector<HTMLInputElement>('[name="metadata__source"]');
  if (metadata) metadata.value = params.content_id;
  // Native navigation to Buttondown is preserved for CAPTCHA and error handling.
});

document.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a');
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !/^\/company\/newsletter\/?$/.test(url.pathname)) return;
  const source = newsletterSource(location.pathname, location.search);
  // Carry report attribution into the dedicated signup page, including footer links.
  if (source !== 'site') { url.searchParams.set('source', source); link.href = url.href; }
  trackSiteEvent('newsletter_click', { content_id: source, placement: link.closest('footer') ? 'footer' : 'page', method: 'link' });
});
