import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const docs = defineCollection({ loader: docsLoader(), schema: docsSchema() });

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    // Set only for a substantive editorial update, never from the build clock.
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Query Farm Team'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    showDescription: z.boolean().default(true),
    showTableOfContents: z.boolean().default(true),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    // The product the article is about, offered as a "Try it" card after the
    // body (PostNextStep.astro). Omit it for posts with no product to try.
    nextStep: z.object({
      title: z.string(),
      pitch: z.string(),
      href: z.string().startsWith('/'),
      cta: z.string(),
      // An extension slug: the card shows that extension's install, with
      // DuckDB 2.0 / 1.5 tabs when it is in the Query.Farm repository.
      extension: z.string().optional(),
      installNote: z.string().optional(),
      repo: z.string().url().optional(),
    }).optional(),
    leadVisual: z.object({
      src: z.string(),
      alt: z.string(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      mobile: z.object({
        src: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }).optional(),
    }).optional(),
  }).refine(({ pubDate, updatedDate }) => !updatedDate || updatedDate >= pubDate, {
    message: 'updatedDate must not precede pubDate',
    path: ['updatedDate'],
  }),
});

export const collections = { blog, docs };
