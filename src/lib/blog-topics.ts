import { tagSlug } from './blog-tags';

/**
 * Topic colour for blog surfaces.
 *
 * The `cat-*` scale exists for "colour carrying real information (a category)"
 * (global.css, DESIGN_BRIEF §4) — which is exactly what a topic is. Before this,
 * a card's band strip was picked by hashing the slug, so the colour encoded
 * nothing and two of three cards came out identical. Here the hue is derived
 * from the post's primary tag, so the same topic is always the same colour and
 * a reader can learn the mapping.
 *
 * Six tints, more topics than tints: colour groups a *subject family* rather
 * than uniquely identifying one tag. Product names anchor a hue and the topics
 * belonging to that product share it — Haybarn/Distribution gold, Quack/RPC
 * plum, VGI/Extensions field.
 */
export type TopicAccent = 'gold' | 'field' | 'clay' | 'slate' | 'plum' | 'moss';

const ACCENTS: TopicAccent[] = ['gold', 'field', 'clay', 'slate', 'plum', 'moss'];

const TOPIC_ACCENTS: Record<string, TopicAccent> = {
  haybarn: 'gold',
  distribution: 'gold',
  vgi: 'field',
  extensions: 'field',
  quack: 'plum',
  rpc: 'plum',
  performance: 'clay',
  webassembly: 'slate',
  testing: 'moss',
};

/** Chip classes, matching the badge convention used by the extension docs and
 *  the Orchard catalog. Full class strings so Tailwind's scanner emits them. */
const CHIP: Record<TopicAccent, string> = {
  gold: 'border-soil-300/70 bg-cat-gold text-cat-gold-ink',
  field: 'border-soil-300/70 bg-cat-field text-cat-field-ink',
  clay: 'border-soil-300/70 bg-cat-clay text-cat-clay-ink',
  slate: 'border-soil-300/70 bg-cat-slate text-cat-slate-ink',
  plum: 'border-soil-300/70 bg-cat-plum text-cat-plum-ink',
  moss: 'border-soil-300/70 bg-cat-moss text-cat-moss-ink',
};

const INK: Record<TopicAccent, string> = {
  gold: 'text-cat-gold-ink',
  field: 'text-cat-field-ink',
  clay: 'text-cat-clay-ink',
  slate: 'text-cat-slate-ink',
  plum: 'text-cat-plum-ink',
  moss: 'text-cat-moss-ink',
};

/**
 * An unmapped topic still gets a stable colour rather than falling to neutral —
 * hashed off the slug, so a new tag is consistent from its first post and only
 * needs a TOPIC_ACCENTS entry when we want to place it in a specific family.
 */
export function topicAccent(topic: string | undefined): TopicAccent {
  if (!topic) return 'moss';
  const slug = tagSlug(topic);
  const mapped = TOPIC_ACCENTS[slug];
  if (mapped) return mapped;
  const hash = [...slug].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return ACCENTS[hash % ACCENTS.length];
}

/**
 * The strata ramp: the topic's chip tint stepped down to its ink, so the
 * core-sample motif survives but every band is one hue — the topic's. Returned
 * as inline `background` values because they interpolate two custom properties
 * per topic, which Tailwind cannot enumerate at build time.
 */
export function topicBands(topic: string | undefined, steps = 6): string[] {
  const accent = topicAccent(topic);
  const tint = `var(--color-cat-${accent})`;
  const ink = `var(--color-cat-${accent}-ink)`;
  return Array.from({ length: steps }, (_, i) => {
    // 100% tint at the top down to 10% at the bottom: light → deep, never a
    // flat block, and the darkest band still carries some of the hue.
    const pct = Math.round(100 - (i * 90) / (steps - 1));
    return `color-mix(in oklab, ${tint} ${pct}%, ${ink})`;
  });
}

export interface TopicTheme {
  label: string;
  accent: TopicAccent;
  /** Chip background + ink + hairline border. */
  chip: string;
  /** Ink colour alone, for a label sitting on paper. */
  ink: string;
  /** Inline `background` values, top to bottom. */
  bands: string[];
  href: string;
}

export function topicTheme(topic: string | undefined, steps = 6): TopicTheme | null {
  if (!topic) return null;
  const accent = topicAccent(topic);
  return {
    label: topic,
    accent,
    chip: CHIP[accent],
    ink: INK[accent],
    bands: topicBands(topic, steps),
    href: `/blog/tags/${tagSlug(topic)}`,
  };
}
