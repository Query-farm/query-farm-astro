import { tagSlug } from './blog-tags';
import { topicBands } from './blog-topics';

/**
 * Contour lines for blog surfaces — the drawn replacement for the gradient
 * band strip.
 *
 * Same contract the strip had (see blog-topics.ts): the drawing is derived
 * from the post's primary tag, so one topic is always the same figure and a
 * reader can learn it. Nothing is random per render or per slug — the seed is
 * the tag, so `distribution` draws identically on the lead card, in the
 * archive row, and on a tag page.
 *
 * They read as contour lines / plough furrows, which is the one figure that is
 * both on-brand for a farm and honest about what it is: decoration that
 * encodes a category, not a picture of the post. This is why the index needs
 * no thumbnails — see the note in FeaturedPost.astro.
 */

/** FNV-1a. Stable across runs, unlike anything using object identity. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, deterministic, good enough for phase offsets. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Catmull-Rom through the sampled points, converted to cubic béziers — so the
 * emitted path is real `C` segments and the line is C1-continuous. Sampling a
 * smooth function and interpolating is far more reliable than hand-placing
 * control points, which kinks wherever two segments disagree.
 */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  const d: string[] = [`M ${round(points[0][0])} ${round(points[0][1])}`];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d.push(`C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2[0])} ${round(p2[1])}`);
  }
  return d.join(' ');
}

export interface TopicCurve {
  d: string;
  stroke: string;
  width: number;
  opacity: number;
}

export interface CurveOptions {
  /** Length of the run, along the direction of flow. */
  width?: number;
  /** Thickness of the bundle, across the flow. */
  height?: number;
  /** How many lines in the bundle. */
  count?: number;
  /** Rotate the whole family — a second surface can vary without a new seed. */
  phase?: number;
  /** Flow top-to-bottom instead of left-to-right (the archive row's rail). */
  vertical?: boolean;
  /**
   * Swing, as a fraction of the gap between neighbouring lines. Below ~0.5 the
   * bundle reads as flat wire; at 1.0 neighbours touch. The right value is a
   * function of the surface's aspect ratio — a long shallow band needs far
   * more swing than a square one to read as curved at all — so it's a knob,
   * not a constant.
   */
  amplitude?: number;
}

/**
 * A bundle of nested contour lines for one topic.
 *
 * Each line is the sum of two sines at incommensurate frequencies, so the
 * bundle never resolves into an obvious repeat and the lines drift apart and
 * back together the way real contours do — rather than sitting as parallel
 * copies of one wave.
 */
export function topicCurves(topic: string | undefined, opts: CurveOptions = {}): TopicCurve[] {
  const {
    width = 1200,
    height = 100,
    count = 6,
    phase = 0,
    vertical = false,
    amplitude = 0.75,
  } = opts;

  const rand = rng(seedFrom(tagSlug(topic ?? 'farm')) + Math.round(phase * 1000));

  // The ramp's lightest steps vanish on cream, so overshoot and drop the top
  // two — the survivors still run light-to-deep in the topic's own hue.
  const palette = topicBands(topic, count + 2).slice(2);

  // Under one and a half cycles across the run. Faster than this and the
  // bundle reads as corrugation rather than contour.
  const baseFreq = 0.85 + rand() * 0.5;
  const drift = 0.55 + rand() * 0.5;
  const globalPhase = rand() * Math.PI * 2;

  // Neighbours may converge but must not cross — crossing contours read as a
  // mistake — so the ceiling is a fraction of the gap, halved because two
  // adjacent lines can swing toward each other at once.
  const inset = 0.13;
  const span = height * (1 - inset * 2);
  const gap = count > 1 ? span / (count - 1) : height;
  const ampCeiling = (gap * amplitude) / 2;

  const SAMPLES = 16;
  const curves: TopicCurve[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const baseY = height * inset + span * t;

    const amp1 = ampCeiling * (0.55 + rand() * 0.45);
    const amp2 = amp1 * (0.25 + rand() * 0.3);
    const ph1 = globalPhase + t * 1.9 + rand() * 0.35;
    const ph2 = globalPhase * 1.7 + t * 3.1;

    const points: [number, number][] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const u = s / SAMPLES;
      const along = width * u;
      const across =
        baseY +
        amp1 * Math.sin(u * Math.PI * 2 * baseFreq + ph1) +
        amp2 * Math.sin(u * Math.PI * 2 * (baseFreq * drift + 1.1) + ph2);
      // Vertical rails flow down the page: the same curve, axes swapped, so a
      // topic's figure is recognisably itself in either orientation.
      points.push(vertical ? [across, along] : [along, across]);
    }

    curves.push({
      d: smoothPath(points),
      stroke: palette[i] ?? palette[palette.length - 1],
      // Deeper lines sit heavier, which reads as depth rather than as noise.
      width: 1.2 + t * 1.1,
      opacity: 0.55 + t * 0.4,
    });
  }

  return curves;
}
