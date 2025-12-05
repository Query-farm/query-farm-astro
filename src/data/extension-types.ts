// Shared type definitions for DuckDB extensions

// Function Documentation Types
export interface FunctionParameter {
  name: string;
  type: string;
  paramType: 'positional' | 'named';
  default?: string;
  description: string;
}

export interface ReturnColumn {
  name: string;
  type: string;
  description: string;
}

export interface FunctionExample {
  description: string;
  code: string;
  output?: string;
  outputTable?: {
    columns: { name: string; align?: 'left' | 'right' | 'center' }[];
    rows: (string | number | boolean)[][];
  };
}

export interface FunctionDocData {
  id: string;
  name: string;
  type: 'scalar' | 'table' | 'aggregate' | 'copy';
  category: string;
  returnType?: string;
  parameters: FunctionParameter[];
  returns?: string;
  returnsTable?: ReturnColumn[];
  description: string;
  examples: FunctionExample[];
  parametersTitle?: string;
  relatedFunctions?: string[];
  tags?: string[];
  options?: FunctionParameter[];
}

// Pragma/Settings Types
export interface Pragma {
  name: string;
  default: string | number | boolean;
  description: string;
  type?: 'string' | 'number' | 'boolean';
  validValues?: string[];
  example?: string;
}

// Secret Types
export interface SecretParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface Secret {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
  parameters: SecretParameter[];
  examples: FunctionExample[];
}

// Macro Types
export interface Macro {
  id: string;
  name: string;
  category: string;
  description: string;
  definition: string;
  examples: FunctionExample[];
}

// Filesystem Types
export interface Filesystem {
  id: string;
  name: string;
  description: string;
  category?: string;
}

// Storage Extension Types
export interface StorageParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface StorageExtension {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: StorageParameter[];
  examples: FunctionExample[];
}

// Log Type Types
export interface LogType {
  id: string;
  name: string;
  category: string;
  description: string;
  examples: FunctionExample[];
}

// Log Storage Type Types
export interface LogStorageParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface LogStorageType {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: LogStorageParameter[];
  examples: FunctionExample[];
}

// Technical Overview Types
export interface BulletPoint {
  label: string;
  description: string;
}

export interface UseCase {
  title: string;
  description: string;
}

export interface TechnicalOverviewSection {
  icon: string;
  title: string;
  description: string;
  bulletPoints?: BulletPoint[];
  useCases?: UseCase[];
}

export interface TechnicalOverview {
  eyebrow?: string;
  title: string;
  description?: string;
  sections: TechnicalOverviewSection[];
}

// Platform with architecture support
export interface PlatformInfo {
  platform: string;
  architectures: string[];
}

// Extension Metadata Types
export interface ExtensionMetadata {
  name: string;
  displayName: string;
  icon: string;
  description: string;
  githubUrl: string;
  cta: {
    title: string;
    description: string;
  };
  // Optional extension info
  license?: string;
  pricing?: 'free' | 'paid' | 'freemium';
  firstRelease?: string; // ISO date string (e.g., '2024-03-01')
  lastRelease?: string; // ISO date string (e.g., '2025-01-15')
  binarySize?: string; // Human-readable size (e.g., '2.4 MB')
  writtenIn?: string; // Programming language (e.g., 'C++', 'Rust')
  sourceAvailable?: boolean | string; // true/false or URL to source
  dependencies?: string[]; // List of required extension names
  usageStats?: {
    count: number;
    period: string; // e.g., "last 60 days"
  };
  githubStars?: number;
  platforms?: PlatformInfo[];
  duckdbVersions?: string[]; // Supported versions (e.g., ['1.1.0', '1.1.1', '1.1.2'])
  unsupportedVersions?: string[]; // Older unsupported versions (e.g., ['1.0.0', '0.10.0'])
  // Related extensions (referenced by extension ID from extensions.ts)
  relatedExtensions?: string[];
  // Detailed image for extension page and social sharing (1200x630px recommended)
  // Falls back to icon emoji if not provided
  image?: string;
}

// Pricing Types
export interface PricingTier {
  name: string;
  price: string;
  period: 'monthly' | 'yearly' | 'one-time';
  description?: string;
  features?: string[];
  highlighted?: boolean;
}

export interface PricingInfo {
  eyebrow?: string;
  title?: string;
  description?: string;
  tiers: PricingTier[];
  trialDays?: number;
  registrationRequired?: boolean;
  registrationUrl?: string;
  termsMarkdown?: string;
}

// Complete Extension Data Structure
export interface ExtensionData {
  metadata: ExtensionMetadata;
  technicalOverview?: TechnicalOverview;
  functions?: FunctionDocData[];
  pragmas?: Pragma[];
  secrets?: Secret[];
  macros?: Macro[];
  filesystems?: Filesystem[];
  storageExtensions?: StorageExtension[];
  logTypes?: LogType[];
  logStorageTypes?: LogStorageType[];
  pricing?: PricingInfo;
}
