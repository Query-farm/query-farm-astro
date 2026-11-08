import { z } from 'zod';

// Shape of catalog.generated.json, written by scripts/vgi-workers/harvest.py.
// The harvest attaches each released worker through haybarn's community `vgi`
// extension and serialises what the catalog itself declares, so most fields are
// optional: a worker whose attach failed still lists with its repo metadata.

const str = z.string().nullable().optional();
const tags = z.record(z.string(), z.unknown()).nullable().optional().default({});

export const columnSchema = z.object({
  name: z.string(),
  type: z.string().nullable().optional().default(''),
  comment: str,
  nullable: z.boolean().nullable().optional(),
});

export const tableSchema = z.object({
  name: z.string(),
  kind: z.enum(['table', 'view']).catch('table'),
  comment: str,
  tags,
  columns: z.array(columnSchema).default([]),
  constraints: z.array(z.string()).default([]),
});

export const argumentSchema = z.object({
  name: z.string().nullable().optional().default(''),
  type: z.string().nullable().optional().default(''),
  description: str,
  default: z.unknown().optional(),
  named: z.boolean().nullable().optional(),
});

export const functionSchema = z.object({
  name: z.string(),
  kind: z.enum(['scalar', 'table', 'table_in_out', 'aggregate', 'macro', 'table_macro', 'other']).catch('other'),
  comment: str,
  tags,
  return_type: str,
  arguments: z.array(argumentSchema).default([]),
  examples: z.array(z.string()).default([]),
});

export const schemaSchema = z.object({
  name: z.string(),
  comment: str,
  tags,
  tables: z.array(tableSchema).default([]),
  functions: z.array(functionSchema).default([]),
});

export const assetSchema = z.object({
  name: z.string(),
  platform: z.string(),
  url: z.string(),
});

export const exampleSchema = z.object({
  title: str,
  description: str,
  sql: z.string(),
});

export const workerRecordSchema = z.object({
  slug: z.string(),
  repo: z.string(),
  repo_url: z.string(),
  catalog: z.string(),
  language: z.string(),
  title: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  doc_md: str,
  keywords: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  license: str,
  source_url: str,
  release: z
    .object({
      tag: z.string(),
      published_at: str,
      assets: z.array(assetSchema).default([]),
    })
    .nullable()
    .optional(),
  image: str,
  run: z
    .object({
      method: z.string().nullable().optional(),
      command: str,
      location_example: str,
      /** Console script for uvx (Python), e.g. `vgi-conform-worker`. */
      script: str,
      /** Verified LOCATION strings, when the harvest checked them. */
      uvx: str,
      github_auto: str,
      docker: str,
    })
    .nullable()
    .optional(),
  readme_sql: str,
  attach_options: z
    .array(
      z.object({
        name: z.string(),
        type: str,
        description: str,
        required: z.boolean().nullable().optional(),
        default: z.unknown().optional(),
      }),
    )
    .default([]),
  example_queries: z.array(exampleSchema).default([]),
  agent_tasks: z.array(z.string()).default([]),
  settings: z
    .array(z.object({ name: z.string(), type: str, description: str }))
    .default([]),
  schemas: z.array(schemaSchema).default([]),
  counts: z
    .object({
      tables: z.number().default(0),
      views: z.number().default(0),
      scalar_functions: z.number().default(0),
      table_functions: z.number().default(0),
      macros: z.number().default(0),
    })
    .partial()
    .nullable()
    .optional(),
  lint: z.object({ score: z.number().nullable().optional(), level: str }).nullable().optional(),
  harvest: z
    .object({
      status: z.string(),
      method: str,
      error: str,
      vgi_version: str,
    })
    .nullable()
    .optional(),
  secret_types: z
    .array(z.object({ name: z.string(), description: str, provider: str }).passthrough())
    .default([]),
  // Full declarations from the vgi extension's vgi_secret_types(): description,
  // where to get credentials (vgi_doc_url), each CREATE SECRET key, and the
  // functions that need it. Null when the harvest's extension couldn't report it.
  secret_type_details: z
    .array(
      z.object({
        name: z.string(),
        description: str,
        doc_url: str,
        parameters: z
          .array(
            z.object({
              name: z.string(),
              type: str,
              required: z.boolean().nullable().optional(),
              redact: z.boolean().nullable().optional(),
              description: str,
            }),
          )
          .default([]),
        required_by: z.array(z.string()).default([]),
      }),
    )
    .nullable()
    .optional(),
  // From `vgi-lint dump`: the worker was attached the way users are told to and
  // every executable example ran. Only verified workers are listed.
  verification: z
    .object({
      verified: z.boolean(),
      status: str,
      total: z.number().nullable().optional(),
      passed: z.number().nullable().optional(),
      failed: z.number().nullable().optional(),
      needs_credentials: z.number().nullable().optional(),
      location: str,
      transport: str,
      environment: z.record(z.string(), z.unknown()).nullable().optional(),
      checked_at: str,
    })
    .nullable()
    .optional(),
  // Commercial model. Every harvested public worker is open and self-run; paid
  // and managed listings (the Orchard connectors) share the same record shape.
  offering: z
    .object({
      pricing: z.enum(['open', 'paid']),
      distribution: z.enum(['self-run', 'managed']),
    })
    .default({ pricing: 'open', distribution: 'self-run' }),
});

export const catalogFileSchema = z.object({
  generated_at: z.string(),
  workers: z.array(workerRecordSchema),
});

export type WorkerRecord = z.infer<typeof workerRecordSchema>;
export type WorkerSchema = z.infer<typeof schemaSchema>;
export type WorkerTable = z.infer<typeof tableSchema>;
export type WorkerFunction = z.infer<typeof functionSchema>;
