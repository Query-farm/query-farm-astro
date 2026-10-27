/** Deliberately separate newsletter interest from a submitted signup request.
 * Buttondown's native form completes validation and double opt-in off-site;
 * a submit event must never be recorded as a confirmed subscription.
 */
type EventName = 'newsletter_click' | 'newsletter_submit' | 'consultation_click';
type EventParams = { content_id: string; placement: string; method: string; subscription_status?: 'submitted'; newsletter_name?: string };
type AnalyticsRuntime = { location: { hostname: string }; gtag?: (command: 'event', name: EventName, params: EventParams & { transport_type: string }) => void };

export function trackSiteEvent(name: EventName, params: EventParams, runtime: AnalyticsRuntime = window as unknown as AnalyticsRuntime) {
  if (!['query.farm', 'www.query.farm'].includes(runtime.location.hostname) || typeof runtime.gtag !== 'function') return false;
  // Select fields explicitly: callers cannot accidentally pass emails or form values.
  const safe: EventParams = {
    content_id: params.content_id, placement: params.placement, method: params.method,
    ...(params.subscription_status ? { subscription_status: params.subscription_status } : {}),
    ...(params.newsletter_name ? { newsletter_name: params.newsletter_name } : {}),
  };
  runtime.gtag('event', name, { ...safe, transport_type: 'beacon' });
  return true;
}

export function newsletterSource(pathname: string, search: string) {
  const report = 'duckdb-2-release-activity';
  return [`/research/${report}`, `/research/${report}/`, `/blog/${report}`, `/blog/${report}/`].includes(pathname) || new URLSearchParams(search).get('source') === report
    ? report : 'site';
}

export function newsletterEvent(placement: string, source: string) {
  return { content_id: source === 'duckdb-2-release-activity' ? source : 'site',
    placement: ['footer', 'newsletter_page', 'release_report'].includes(placement) ? placement : 'site',
    method: 'buttondown', newsletter_name: 'queryfarm-dispatch', subscription_status: 'submitted' as const };
}
