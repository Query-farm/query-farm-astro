import { z } from 'zod';
import { FunctionsArraySchema } from './schemas';
import type { FunctionDocData } from './extension-types';

/**
 * Formats Zod validation errors into readable messages
 */
function formatZodError(error: z.ZodError, filePath: string): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path ? `[${path}]` : 'root'}: ${issue.message}`;
  });

  return `Validation failed for ${filePath}:\n${issues.join('\n')}`;
}

/**
 * Loads and validates functions data from a JSON file.
 * Throws descriptive errors if validation fails.
 *
 * @param jsonData - The parsed JSON data (imported or fetched)
 * @param sourcePath - Path to the source file (for error messages)
 * @returns Validated array of FunctionDocData
 */
export function loadFunctions(jsonData: unknown, sourcePath: string = 'unknown'): FunctionDocData[] {
  const result = FunctionsArraySchema.safeParse(jsonData);

  if (!result.success) {
    const errorMessage = formatZodError(result.error, sourcePath);
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data as FunctionDocData[];
}

/**
 * Validates functions data without throwing, returns validation result.
 * Useful for build-time validation or testing.
 *
 * @param jsonData - The parsed JSON data
 * @param sourcePath - Path to the source file (for error messages)
 * @returns Object with success status and either data or formatted error
 */
export function validateFunctions(jsonData: unknown, sourcePath: string = 'unknown'): {
  success: boolean;
  data?: FunctionDocData[];
  error?: string;
} {
  const result = FunctionsArraySchema.safeParse(jsonData);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error, sourcePath)
    };
  }

  return {
    success: true,
    data: result.data as FunctionDocData[]
  };
}

/**
 * Validates a single function entry.
 * Useful for incremental validation during development.
 */
export function validateFunction(fnData: unknown, sourcePath: string = 'unknown'): {
  success: boolean;
  data?: FunctionDocData;
  error?: string;
} {
  const { FunctionDocDataSchema } = require('./schemas');
  const result = FunctionDocDataSchema.safeParse(fnData);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error, sourcePath)
    };
  }

  return {
    success: true,
    data: result.data as FunctionDocData
  };
}
