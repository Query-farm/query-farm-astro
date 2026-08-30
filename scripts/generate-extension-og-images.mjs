#!/usr/bin/env node
// Generates a branded Open Graph card for every public extension that doesn't
// already have a hand-made one (a5, datasketches, and vgi set their own
// `image` in augment/metadata.json and are left alone). Output goes to
// public/og/extensions/<slug>.png and is picked up automatically by
// src/pages/products/extensions/[slug].astro, which falls back to it when
// metadata.image is unset.
//
// Run explicitly and commit the result — same "explicit script, review the
// diff, commit" pattern as scripts/snapshot-usage.sh. Nothing here runs
// during `npm run build`.
//
// Usage: node scripts/generate-extension-og-images.mjs [--slug=<id>]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, clip, wordmark, fileDataUri, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSIONS_DIR = `${ROOT}/src/data/extensions`;
const OUT_DIR = `${ROOT}/public/og/extensions`;

// The circular DuckDB mark — every card's brand tie to "this runs inside
// DuckDB", the same way the flagship /og/extensions.jpg leads with product
// iconography on its right side.
const DUCKDB_ICON = fileDataUri(`${ROOT}/public/images/duckdb-icon.svg`);

// Mirrors src/data/extensions.ts's HIDDEN_FROM_LISTING / TODO-description
// filter: only cards for extensions that actually appear on the public site.
const HIDDEN_FROM_LISTING = new Set(['example', 'chsql', 'quackscale']);

// Mirrors ExtensionCard.astro's CATEGORY_LABEL.
const CATEGORY_LABEL = {
  connectors: 'Connector',
  transformation: 'Transformation',
  analytics: 'Analytics',
  performance: 'Performance',
  devtools: 'Developer tools',
  quality: 'Data quality',
};

// Mirrors src/data/category-theme.ts's categoryIconTheme (Tailwind sky/violet/
// fuchsia/amber/teal/emerald 100 & 700), resolved to hex since satori renders
// outside of Tailwind. Computed from tailwindcss/theme.css's oklch values.
const CATEGORY_COLOR = {
  connectors: { tile: '#dff2fe', ink: '#0069a8' }, // sky
  transformation: { tile: '#ede9fe', ink: '#7008e7' }, // violet
  analytics: { tile: '#fae8ff', ink: '#a800b7' }, // fuchsia
  performance: { tile: '#fef3c6', ink: '#bb4d00' }, // amber
  devtools: { tile: '#cbfbf1', ink: '#00786f' }, // teal
  quality: { tile: '#d0fae5', ink: '#007a55' }, // emerald
};

function loadMetadata(slug) {
  const path = `${EXTENSIONS_DIR}/${slug}/augment/metadata.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function publicExtensionSlugs() {
  return readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((slug) => !HIDDEN_FROM_LISTING.has(slug))
    .filter((slug) => {
      const m = loadMetadata(slug);
      return m && !/^\s*TODO\b/i.test(m.description ?? '');
    });
}

function card({ displayName, description, category }) {
  const { tile, ink } = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.connectors;
  const label = CATEGORY_LABEL[category] ?? category;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: COLORS.soilPaper,
        fontFamily: 'Commissioner',
      },
      children: [
        // Top accent bar, category-coded — echoes the six-color "pipe" bands
        // used elsewhere on the site without needing a gradient.
        { type: 'div', props: { style: { display: 'flex', width: '100%', height: '10px', backgroundColor: ink } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '64px 72px', justifyContent: 'space-between' },
            children: [
              {
                // Text on the left, the DuckDB mark on the right — the same
                // split the hand-illustrated hero images use.
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '32px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', flex: 1 },
                        children: [
                          wordmark(),
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                marginTop: '44px',
                                padding: '6px 16px',
                                borderRadius: '9999px',
                                backgroundColor: tile,
                                color: ink,
                                fontFamily: 'Commissioner',
                                fontWeight: 600,
                                fontSize: '16px',
                                letterSpacing: '0.02em',
                              },
                              children: label.toUpperCase(),
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                marginTop: '28px',
                                maxWidth: '760px',
                                fontFamily: 'Petrona',
                                fontWeight: 700,
                                fontSize: '62px',
                                lineHeight: 1.08,
                                color: COLORS.soil900,
                              },
                              children: clip(displayName, 46),
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                marginTop: '24px',
                                maxWidth: '720px',
                                fontFamily: 'Commissioner',
                                fontWeight: 400,
                                fontSize: '27px',
                                lineHeight: 1.45,
                                color: COLORS.soil700,
                              },
                              children: clip(description, 150),
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'img',
                      props: { src: DUCKDB_ICON, width: 150, height: 150 },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontFamily: 'Commissioner',
                    fontWeight: 500,
                    fontSize: '19px',
                    color: COLORS.soil600,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '5px 14px',
                          borderRadius: '9999px',
                          border: `1px solid ${COLORS.soil300}`,
                          color: COLORS.soil900,
                          fontWeight: 600,
                        },
                        children: 'DuckDB Extension',
                      },
                    },
                    { type: 'div', props: { style: { display: 'flex' }, children: 'query.farm' } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function main() {
  const onlySlug = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
  mkdirSync(OUT_DIR, { recursive: true });

  const slugs = onlySlug ? [onlySlug] : publicExtensionSlugs();
  let written = 0;
  for (const slug of slugs) {
    const meta = loadMetadata(slug);
    if (!meta) {
      console.warn(`skip ${slug}: no augment/metadata.json`);
      continue;
    }
    if (meta.image) {
      // Hand-made art already set (a5, datasketches, vgi as of writing) —
      // don't overwrite curated OG art with the generated template.
      continue;
    }
    const png = await renderToPng(
      card({ displayName: meta.displayName, description: meta.description, category: meta.category })
    );
    writeFileSync(`${OUT_DIR}/${slug}.png`, png);
    written += 1;
  }
  console.log(`Wrote ${written} extension OG image(s) to ${OUT_DIR}`);
}

main();
