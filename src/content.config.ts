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
    author: z.string().default('Query.Farm Team'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    showTableOfContents: z.boolean().default(true),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
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
