import { z } from 'zod';

// ---------- Function docs ----------

export const FunctionParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  paramType: z.enum(['positional', 'named']),
  default: z.string().optional(),
  description: z.string(),
  varargs: z.boolean().optional(),
  // Optional positional parameter — rendered in the signature as [, name: TYPE]
  // (e.g. a function with two arities where the last arg may be omitted).
  optional: z.boolean().optional(),
  // Set when overloads collapsed into one card differ in this slot's type.
  // Lists every concrete type accepted in this slot. `type` becomes a
  // human-friendly label (family name or pipe-joined union) for display.
  typeUnion: z.array(z.string()).optional(),
});

export const ReturnColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const OutputTableSchema = z.object({
  columns: z.array(z.object({
    name: z.string(),
    align: z.enum(['left', 'right', 'center']).optional(),
  })),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
});

export const FunctionExampleSchema = z.object({
  description: z.string(),
  code: z.string(),
  output: z.string().optional(),
  outputTable: OutputTableSchema.optional(),
});

export const FunctionDocDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['scalar', 'table', 'aggregate', 'copy']),
  categories: z.array(z.string()).default([]),
  returnType: z.string().optional(),
  parameters: z.array(FunctionParameterSchema),
  returns: z.string().optional(),
  returnsTable: z.array(ReturnColumnSchema).optional(),
  // Table functions whose output columns are resolved at bind time (e.g. they
  // mirror a remote table or a worker-defined function) have no fixed schema to
  // tabulate. Flag them so the docs render a "dynamic schema" note instead of an
  // empty/misleading column table. Pair with a `returns` prose explanation.
  returnsTableDynamic: z.boolean().optional(),
  description: z.string(),
  examples: z.array(FunctionExampleSchema),
  relatedFunctions: z.array(z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  options: z.array(FunctionParameterSchema).optional(),
  // Set when collapsed overloads return different types. `returnType` becomes
  // the union label; this lists every concrete return type observed.
  returnTypeUnion: z.array(z.string()).optional(),
});

// ---------- Pragmas / Settings ----------

export const PragmaSchema = z.object({
  name: z.string(),
  default: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  description: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'map']).optional(),
  // The real DuckDB setting type (e.g. "UBIGINT", "MAP(VARCHAR, BIGINT)"), shown
  // verbatim so the docs respect the actual type rather than a coarse category.
  valueType: z.string().optional(),
  validValues: z.array(z.string()).optional(),
  example: z.string().optional(),
});

// ---------- Secrets ----------

export const SecretParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string(),
});

export const SecretSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.string().default('Connection'),
  description: z.string(),
  parameters: z.array(SecretParameterSchema),
  examples: z.array(FunctionExampleSchema),
});

// ---------- Macros ----------

export const MacroSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  definition: z.string(),
  examples: z.array(FunctionExampleSchema),
});

// ---------- Filesystems ----------

export const FilesystemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
});

// ---------- Storage extensions ----------

export const StorageParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string(),
  default: z.string().optional(),
});

export const StorageExtensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  parameters: z.array(StorageParameterSchema),
  examples: z.array(FunctionExampleSchema),
});

// ---------- Log types ----------

export const LogTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  examples: z.array(FunctionExampleSchema),
});

export const LogStorageParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string(),
  default: z.string().optional(),
});

export const LogStorageTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  parameters: z.array(LogStorageParameterSchema),
  examples: z.array(FunctionExampleSchema),
});

// ---------- Technical overview ----------

export const BulletPointSchema = z.object({
  label: z.string(),
  description: z.string(),
});

export const UseCaseSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const TechnicalOverviewSectionSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
  // Optional figure rendered under the section description (e.g. an explanatory
  // diagram or SVG in /public). Breaks up text-heavy overviews.
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  imageCaption: z.string().optional(),
  // Optional code sample rendered under the description (syntax-highlighted).
  code: z.string().optional(),
  codeLanguage: z.string().optional(),
  codeTitle: z.string().optional(),
  bulletPoints: z.array(BulletPointSchema).optional(),
  useCases: z.array(UseCaseSchema).optional(),
  // Optional highlighted callout rendered at the end of the section.
  callout: z.object({
    title: z.string().optional(),
    body: z.string(),
  }).optional(),
});

export const TechnicalOverviewSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(TechnicalOverviewSectionSchema),
});

// ---------- Metadata ----------

export const PlatformInfoSchema = z.object({
  platform: z.string(),
  architectures: z.array(z.string()),
});

export const ExtensionCategorySchema = z.enum([
  'connectors', 'transformation', 'analytics', 'performance', 'devtools', 'quality',
]);

export const ExtensionStatusSchema = z.enum(['stable', 'beta', 'experimental']);

// A single quick-start example: an explicit title plus its SQL body. The title
// is data (not a comment parsed out of the SQL), and the sql is opaque — it may
// contain its own `--` comments without ambiguity. Each renders as its own cell
// with its own "Try" button.
export const QuickStartExampleSchema = z.object({
  title: z.string().optional(),
  sql: z.string(),
});

export const ExtensionMetadataSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  icon: z.string(),
  description: z.string(),
  githubUrl: z.string(),
  cta: z.object({
    title: z.string(),
    description: z.string(),
  }),
  category: ExtensionCategorySchema.optional(),
  status: ExtensionStatusSchema.optional(),
  docsUrl: z.string().optional(),
  features: z.array(z.string()).optional(),
  // 'community' (DuckDB Community Extensions) or 'query.farm' or a literal
  // INSTALL clause like "FROM 'github://owner/repo'". Defaults to 'community'.
  installSource: z.string().default('community'),
  // Quick-start examples shown below Install. Preferred form is an array of
  // {title, sql} examples (each rendered as its own Try-able cell). A bare
  // string is the legacy single-block form, still accepted during migration.
  quickStart: z.union([z.string(), z.array(QuickStartExampleSchema)]).optional(),
  license: z.string().optional(),
  pricing: z.enum(['free', 'paid']).optional(),
  firstRelease: z.string().optional(),
  lastRelease: z.string().optional(),
  binarySize: z.string().optional(),
  writtenIn: z.string().optional(),
  sourceAvailable: z.union([z.boolean(), z.string()]).optional(),
  dependencies: z.array(z.string()).optional(),
  usageStats: z.object({
    count: z.number(),
    period: z.string(),
  }).optional(),
  githubStars: z.number().optional(),
  platforms: z.array(PlatformInfoSchema).optional(),
  duckdbVersions: z.array(z.string()).optional(),
  // Per (platform, architecture) compiled artifact size in bytes. Discovered
  // by extension-diff.py from Content-Length on community-extensions.duckdb.org.
  binarySizes: z.array(z.object({
    platform: z.string(),
    architecture: z.string(),
    bytes: z.number().int().nonnegative(),
  })).optional(),
  relatedExtensions: z.array(z.string()).optional(),
  image: z.string().optional(),
  // Page-top notice banner — for deprecation, successor announcements,
  // breaking-change advisories, etc. Renders directly under the Hero, before
  // any other content. Body supports inline markdown (links, code, emphasis).
  notice: z.object({
    type: z.enum(['note', 'tip', 'warning', 'danger', 'info']).default('warning'),
    title: z.string(),
    body: z.string(),
    // Optional Buttondown newsletter list ID. When set, the notice renders
    // an inline subscribe form below the body, posting to Buttondown's
    // embed-subscribe endpoint. Visitor enters their email; on submit it
    // opens Buttondown's confirmation page in a popup.
    buttondownList: z.string().optional(),
    // Optional CTA-button label that wraps the form's "subscribe" action.
    // Defaults to "Notify me on release" when buttondownList is set.
    buttondownCta: z.string().optional(),
  }).optional(),
});

// ---------- Pricing ----------

export const PricingTierSchema = z.object({
  name: z.string(),
  price: z.string(),
  period: z.enum(['monthly', 'yearly', 'one-time']),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  highlighted: z.boolean().optional(),
});

export const PricingInfoSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  tiers: z.array(PricingTierSchema),
  trialDays: z.number().optional(),
  registrationRequired: z.boolean().optional(),
  registrationUrl: z.string().optional(),
  termsMarkdown: z.string().optional(),
});

// ---------- Top-level ----------

export const ExtensionDataSchema = z.object({
  metadata: ExtensionMetadataSchema,
  technicalOverview: TechnicalOverviewSchema.optional(),
  functions: z.array(FunctionDocDataSchema).optional(),
  pragmas: z.array(PragmaSchema).optional(),
  secrets: z.array(SecretSchema).optional(),
  macros: z.array(MacroSchema).optional(),
  filesystems: z.array(FilesystemSchema).optional(),
  storageExtensions: z.array(StorageExtensionSchema).optional(),
  logTypes: z.array(LogTypeSchema).optional(),
  logStorageTypes: z.array(LogStorageTypeSchema).optional(),
  pricing: PricingInfoSchema.optional(),
  // Optional map of category name -> short prose explaining what the category
  // covers. Rendered below each category header in the contents table.
  categoryDescriptions: z.record(z.string(), z.string()).optional(),
});

// Convenience exported array forms
export const FunctionsArraySchema = z.array(FunctionDocDataSchema);

// ---------- Site-wide usage summary ----------

// Written by extension-diff-tools/usage-snapshot.py from Cloudflare Analytics
// Engine. Drives the proof-point band on the extensions index. The current
// (partial) ISO week is excluded from `weeklyBuckets` upstream.
export const UsageSummarySchema = z.object({
  // Annualized run-rate: the measured `windowTotalLoads` over `windowDays`
  // scaled to 365 days. AE only retains ~90 days, so a true yearly total
  // isn't available — see extension-diff-tools/usage-snapshot.py.
  annualizedLoads: z.number().int().nonnegative(),
  windowDays: z.number().int().positive(),
  windowTotalLoads: z.number().int().nonnegative(),
  weeklyBuckets: z.array(z.object({
    weekStarting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    loads: z.number().int().nonnegative(),
  })),
  asOf: z.string(),
});
