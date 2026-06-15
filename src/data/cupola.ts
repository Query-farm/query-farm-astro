// Single source of truth for Cupola's external URLs. The demo service URL in
// particular is expected to change (it will move to a query.farm host), so keep
// it here rather than inline in the page/components.

/** Hosted Cupola web app. */
export const CUPOLA_APP = 'https://cupola.query-farm.services';

/** Cupola source repository. */
export const CUPOLA_REPO = 'https://github.com/Query-farm/cupola';

/**
 * Example VGI server users can open in Cupola to try it on real data.
 * TODO: switch to https://vgi-volcanos.query.farm once that host is live.
 */
export const CUPOLA_DEMO_SERVICE = 'https://vgi-volcanos.fly.dev';

/** Deep link that launches Cupola pre-pointed at the demo service. */
export const cupolaDemoLaunchUrl = `${CUPOLA_APP}/?service=${CUPOLA_DEMO_SERVICE}`;
