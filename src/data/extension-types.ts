// Types are inferred from the zod schemas in ./schemas. The schemas are the
// single source of truth — edit shapes there.
import type { z } from 'zod';
import type {
  FunctionParameterSchema,
  ReturnColumnSchema,
  OutputTableSchema,
  FunctionExampleSchema,
  FunctionDocDataSchema,
  FunctionFormSchema,
  PragmaSchema,
  SecretParameterSchema,
  SecretSchema,
  MacroSchema,
  FilesystemSchema,
  StorageParameterSchema,
  StorageExtensionSchema,
  LogTypeSchema,
  LogStorageParameterSchema,
  LogStorageTypeSchema,
  BulletPointSchema,
  UseCaseSchema,
  TechnicalOverviewSectionSchema,
  TechnicalOverviewSchema,
  PlatformInfoSchema,
  ExtensionMetadataSchema,
  PricingTierSchema,
  PricingInfoSchema,
  ExtensionDataSchema,
} from './schemas';

export type FunctionParameter = z.infer<typeof FunctionParameterSchema>;
export type ReturnColumn = z.infer<typeof ReturnColumnSchema>;
export type OutputTable = z.infer<typeof OutputTableSchema>;
export type FunctionExample = z.infer<typeof FunctionExampleSchema>;
export type FunctionDocData = z.infer<typeof FunctionDocDataSchema>;
export type FunctionForm = z.infer<typeof FunctionFormSchema>;
export type Pragma = z.infer<typeof PragmaSchema>;
export type SecretParameter = z.infer<typeof SecretParameterSchema>;
export type Secret = z.infer<typeof SecretSchema>;
export type Macro = z.infer<typeof MacroSchema>;
export type Filesystem = z.infer<typeof FilesystemSchema>;
export type StorageParameter = z.infer<typeof StorageParameterSchema>;
export type StorageExtension = z.infer<typeof StorageExtensionSchema>;
export type LogType = z.infer<typeof LogTypeSchema>;
export type LogStorageParameter = z.infer<typeof LogStorageParameterSchema>;
export type LogStorageType = z.infer<typeof LogStorageTypeSchema>;
export type BulletPoint = z.infer<typeof BulletPointSchema>;
export type UseCase = z.infer<typeof UseCaseSchema>;
export type TechnicalOverviewSection = z.infer<typeof TechnicalOverviewSectionSchema>;
export type TechnicalOverview = z.infer<typeof TechnicalOverviewSchema>;
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;
export type ExtensionMetadata = z.infer<typeof ExtensionMetadataSchema>;
export type PricingTier = z.infer<typeof PricingTierSchema>;
export type PricingInfo = z.infer<typeof PricingInfoSchema>;
export type ExtensionData = z.infer<typeof ExtensionDataSchema>;
