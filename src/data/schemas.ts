import { z } from 'zod';

// Function Documentation Schemas
export const FunctionParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  paramType: z.enum(['positional', 'named']),
  default: z.string().optional(),
  description: z.string(),
  varargs: z.boolean().optional()
});

export const ReturnColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string()
});

export const OutputTableSchema = z.object({
  columns: z.array(z.object({
    name: z.string(),
    align: z.enum(['left', 'right', 'center']).optional()
  })),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()])))
});

export const FunctionExampleSchema = z.object({
  description: z.string(),
  code: z.string(),
  output: z.string().optional(),
  outputTable: OutputTableSchema.optional()
});

export const FunctionDocDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['scalar', 'table', 'aggregate', 'copy']),
  categories: z.array(z.string()).min(1),
  returnType: z.string().optional(),
  parameters: z.array(FunctionParameterSchema),
  returns: z.string().optional(),
  returnsTable: z.array(ReturnColumnSchema).optional(),
  description: z.string(),
  examples: z.array(FunctionExampleSchema),
  relatedFunctions: z.array(z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  options: z.array(FunctionParameterSchema).optional()
});

export const FunctionsArraySchema = z.array(FunctionDocDataSchema);

// Type exports inferred from schemas
export type FunctionParameterZ = z.infer<typeof FunctionParameterSchema>;
export type ReturnColumnZ = z.infer<typeof ReturnColumnSchema>;
export type FunctionExampleZ = z.infer<typeof FunctionExampleSchema>;
export type FunctionDocDataZ = z.infer<typeof FunctionDocDataSchema>;
