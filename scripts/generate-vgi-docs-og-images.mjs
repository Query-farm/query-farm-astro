#!/usr/bin/env node
// Generates one Open Graph card per VGI docs section (Concepts + each SDK
// language) — not per page. 193 individual doc pages sharing a handful of
// section cards is the deliberate scope here: every page in a section is
// visually identical when unfurled, but the section itself is clearly
// identified, which is the improvement over today's total absence of an
// og:image on any of these pages.
//
// Output goes to public/og/vgi-docs/<section-slug>.png, wired in by
// src/starlightRouteData.ts. Run explicitly and commit the result, same as
// generate-extension-og-images.mjs — nothing here runs during `npm run build`.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToPng, wordmark, fileDataUri, COLORS, WIDTH, HEIGHT } from './og-images/render.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${ROOT}/public/og/vgi-docs`;

// The illustrated VGI badge (public/vgi/vgi-logo.png, also handed out from
// the media kit) — every section's tie back to VGI itself, on the right,
// same split as the extension cards' DuckDB mark.
const VGI_LOGO = fileDataUri(`${ROOT}/public/vgi/vgi-logo.png`);
const VGI_LOGO_HEIGHT = 260;
const VGI_LOGO_WIDTH = Math.round(VGI_LOGO_HEIGHT * (600 / 437));

const SIMPLE_ICONS = JSON.parse(readFileSync(`${ROOT}/node_modules/@iconify-json/simple-icons/icons.json`, 'utf-8'));
const PH_ICONS = JSON.parse(readFileSync(`${ROOT}/node_modules/@iconify-json/ph/icons.json`, 'utf-8'));

/** Base64-encode an iconify glyph as a same-color (site ink) inline SVG data URI. */
function iconDataUri(set, name, color) {
  const icon = set.icons[name];
  const size = set.width ?? 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="${color}">${icon.body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Mirrors the `slug`/`name`/`icon` rows in src/lib/vgi-docs.ts. Kept as a
// plain literal here (rather than importing that file) since it's a small,
// stable list and the source file is TypeScript/Vite-glob-flavored — this
// script runs under plain Node, outside the Astro/Vite pipeline.
const SECTIONS = [
  { slug: 'concepts', name: 'Concepts', tagline: 'Language-neutral concepts behind every VGI worker.', icon: { set: PH_ICONS, name: 'compass-bold' } },
  { slug: 'python', name: 'Python', tagline: 'The VGI SDK for Python.', icon: { set: SIMPLE_ICONS, name: 'python' } },
  { slug: 'go', name: 'Go', tagline: 'The VGI SDK for Go.', icon: { set: SIMPLE_ICONS, name: 'go' } },
  { slug: 'typescript', name: 'TypeScript', tagline: 'The VGI SDK for TypeScript.', icon: { set: SIMPLE_ICONS, name: 'typescript' } },
  { slug: 'rust', name: 'Rust', tagline: 'The VGI SDK for Rust.', icon: { set: SIMPLE_ICONS, name: 'rust' } },
  { slug: 'java', name: 'Java', tagline: 'The VGI SDK for Java.', icon: { set: SIMPLE_ICONS, name: 'openjdk' } },
  { slug: 'csharp', name: 'C#', tagline: 'The VGI SDK for C#.', icon: { set: SIMPLE_ICONS, name: 'csharp' } },
];

function card({ name, tagline, icon }) {
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
        { type: 'div', props: { style: { display: 'flex', width: '100%', height: '10px', backgroundColor: COLORS.sun700 } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '64px 72px', justifyContent: 'space-between' },
            children: [
              {
                // Text on the left, the VGI badge on the right — same split
                // as the extension cards' DuckDB mark.
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
                                backgroundColor: '#efe9db', // --color-soil-100
                                color: COLORS.soil700,
                                fontFamily: 'Commissioner',
                                fontWeight: 600,
                                fontSize: '16px',
                                letterSpacing: '0.02em',
                              },
                              children: 'VGI DOCUMENTATION',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: { display: 'flex', alignItems: 'center', gap: '28px', marginTop: '32px' },
                              children: [
                                {
                                  type: 'img',
                                  props: {
                                    src: iconDataUri(icon.set, icon.name, COLORS.soil900),
                                    width: 84,
                                    height: 84,
                                  },
                                },
                                {
                                  type: 'div',
                                  props: {
                                    style: { display: 'flex', fontFamily: 'Petrona', fontWeight: 700, fontSize: '72px', color: COLORS.soil900 },
                                    children: name,
                                  },
                                },
                              ],
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                marginTop: '26px',
                                maxWidth: '620px',
                                fontFamily: 'Commissioner',
                                fontWeight: 400,
                                fontSize: '28px',
                                lineHeight: 1.45,
                                color: COLORS.soil700,
                              },
                              children: tagline,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'img',
                      props: { src: VGI_LOGO, width: VGI_LOGO_WIDTH, height: VGI_LOGO_HEIGHT },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', fontFamily: 'Commissioner', fontWeight: 500, fontSize: '19px', color: COLORS.soil600 },
                  children: 'query.farm/vgi/docs',
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
  mkdirSync(OUT_DIR, { recursive: true });
  for (const section of SECTIONS) {
    const png = await renderToPng(card(section));
    writeFileSync(`${OUT_DIR}/${section.slug}.png`, png);
  }
  console.log(`Wrote ${SECTIONS.length} VGI docs OG image(s) to ${OUT_DIR}`);
}

main();
