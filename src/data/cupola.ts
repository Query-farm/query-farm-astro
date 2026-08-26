// Single source of truth for Cupola's external URLs and its example sources.

/** Hosted Cupola web app. */
export const CUPOLA_APP = 'https://cupola.query-farm.services';

/** Cupola source repository. */
export const CUPOLA_REPO = 'https://github.com/Query-farm/cupola';

/** Deep link that launches Cupola pre-pointed at a VGI service. */
export function cupolaLaunchUrl(service: string): string {
  return `${CUPOLA_APP}/?service=${service}`;
}

/**
 * The example sources this page offers.
 *
 * These are the same live workers the VGI 10-second tour runs against (see
 * src/pages/vgi/index.astro), deliberately: they are public, they need no key,
 * and — the point here — **none of them asks the visitor to sign in**. The page
 * previously pointed at a single demo that required a Google account, so every
 * "try it" path put an auth wall between the click and the product.
 *
 * VERIFIED 2026-08-17: each URL was opened against the hosted Cupola build
 * (v0.4.110) in a real browser and rendered its catalog with no auth prompt.
 * Cupola's OAuth / PKCE support is unchanged and still covers sources that do
 * require identity — it just is not in the way of the demo any more.
 */
export const CUPOLA_DEMOS = [
  {
    id: 'earthquakes',
    label: 'Earthquakes',
    source: 'USGS',
    service: 'https://vgi-earthquakes.rusty-bb6.workers.dev',
    shape: '2 tables · 30 documented columns',
    blurb:
      'Every earthquake on Earth in the last 30 days, plus the full historical catalog going back over a century — the same live feed seismologists watch, as two ordinary tables.',
  },
  {
    id: 'weather',
    label: 'Weather',
    source: 'Open-Meteo',
    service: 'https://vgi-open-meteo.rusty-bb6.workers.dev',
    shape: 'Forecast, air quality, geocoding',
    blurb:
      'Forecasts, air quality, marine and climate data, plus geocoding and elevation — a whole weather API exposed as SQL table functions you can join against.',
  },
  {
    id: 'trains',
    label: 'Dutch railways',
    source: 'NS (Nederlandse Spoorwegen)',
    service: 'https://vgi-trains-ts.rusty-bb6.workers.dev',
    shape: '3 tables · 2 functions',
    blurb:
      'Live departure boards from every Dutch station — the same real-time data shown on the platform displays at Amsterdam Centraal, as a table you can query.',
  },
] as const;

/** The example the primary buttons open: real tables, nothing to parameterise. */
export const CUPOLA_DEMO = CUPOLA_DEMOS[0];

/** Deep link that launches Cupola pre-pointed at the default example. */
export const cupolaDemoLaunchUrl = cupolaLaunchUrl(CUPOLA_DEMO.service);
