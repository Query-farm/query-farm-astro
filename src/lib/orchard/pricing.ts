// Hosted Orchard pricing — the one place sizes, Fly.io prices and the markup
// live. The hosted product page, the console and the Stripe meter all read
// from here, so a price change is one edit (plus the matching Stripe prices:
// see docs/orchard-hosted.md).
//
// Pricing formula: Fly.io infrastructure cost + 35%, plus a monthly license
// fee for workers whose `offering.pricing === 'paid'`.

/** Multiplier applied to Fly.io's list price. */
export const FLY_MARKUP = 1.35;

/** Fly.io bills a started Machine for 30-day months in its price list. */
export const FLY_HOURS_PER_MONTH = 720;

/** When the Fly.io prices below were read from https://fly.io/docs/about/pricing/ (iad/ewr, the lowest-priced regions). */
export const FLY_PRICES_AS_OF = '2026-11-16';

/** Monthly license fee, per hosted deployment of a paid worker, in USD. */
export const LICENSE_MONTHLY_USD = 49;

/** The most instances a customer can ask for on one deployment. */
export const MAX_INSTANCES = 10;

export type SizeId = 's' | 'm' | 'l';

export interface HostedSize {
  id: SizeId;
  label: string;
  /** The Fly Machine preset Rusty passes to `fly deploy --vm-size`. */
  flyPreset: string;
  cpus: string;
  memoryGb: number;
  /** Fly.io list price for a Machine running all month, USD. */
  flyMonthlyUsd: number;
  /** Stripe Billing Meter event name for this size (instance-minutes). */
  meterEvent: string;
  /** Env var holding the Stripe metered price for this size. */
  priceEnv: 'STRIPE_PRICE_S' | 'STRIPE_PRICE_M' | 'STRIPE_PRICE_L';
  blurb: string;
}

export const SIZES: readonly HostedSize[] = [
  {
    id: 's', label: 'Small', flyPreset: 'shared-cpu-1x', cpus: '1 shared vCPU', memoryGb: 1, flyMonthlyUsd: 6.70,
    meterEvent: 'orchard_instance_minutes_s', priceEnv: 'STRIPE_PRICE_S',
    blurb: 'API connectors and light lookups.',
  },
  {
    id: 'm', label: 'Medium', flyPreset: 'shared-cpu-2x', cpus: '2 shared vCPUs', memoryGb: 2, flyMonthlyUsd: 13.39,
    meterEvent: 'orchard_instance_minutes_m', priceEnv: 'STRIPE_PRICE_M',
    blurb: 'File formats, parsing and moderate concurrency.',
  },
  {
    id: 'l', label: 'Large', flyPreset: 'performance-2x', cpus: '2 dedicated vCPUs', memoryGb: 4, flyMonthlyUsd: 66.00,
    meterEvent: 'orchard_instance_minutes_l', priceEnv: 'STRIPE_PRICE_L',
    blurb: 'Models, heavy transforms and sustained load.',
  },
] as const;

/** Regions offered in the console. Prices above are Fly's US-East rates; other regions can cost more and are confirmed before provisioning. */
export const REGIONS = [
  { id: 'iad', label: 'Ashburn, Virginia (US)' },
  { id: 'ord', label: 'Chicago, Illinois (US)' },
  { id: 'sjc', label: 'San Jose, California (US)' },
  { id: 'lhr', label: 'London (UK)' },
  { id: 'fra', label: 'Frankfurt (Germany)' },
  { id: 'nrt', label: 'Tokyo (Japan)' },
  { id: 'syd', label: 'Sydney (Australia)' },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

export const sizeById = (id: string): HostedSize | undefined => SIZES.find(s => s.id === id);
export const isRegion = (id: string): id is RegionId => REGIONS.some(r => r.id === id);

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** What Query.Farm charges per instance-hour, USD. */
export const hourlyUsd = (size: HostedSize) => (size.flyMonthlyUsd / FLY_HOURS_PER_MONTH) * FLY_MARKUP;

/** What Query.Farm charges for one instance running a whole month, USD. */
export const monthlyUsd = (size: HostedSize) => round(size.flyMonthlyUsd * FLY_MARKUP, 2);

/**
 * The per-instance-minute unit price in cents, for the Stripe price's
 * `unit_amount_decimal`. Stripe meter values must be whole numbers, so usage is
 * metered in instance-minutes rather than fractional hours.
 */
export const minuteUnitAmountDecimal = (size: HostedSize) => (hourlyUsd(size) * 100 / 60).toFixed(12);

/** The cost of `minutes` instance-minutes at this size, USD. */
export const minutesCostUsd = (size: HostedSize, minutes: number) => (minutes / 60) * hourlyUsd(size);

export const usd = (n: number, digits = 2) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
