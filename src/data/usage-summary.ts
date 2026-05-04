import { UsageSummarySchema } from './schemas';
import type { z } from 'zod';

export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// Glob keeps the import optional — if the snapshot hasn't been run yet, the
// file may not exist and the index page falls back to hiding the proof band.
const summaryModules = import.meta.glob<unknown>(
  './generated/usage-summary.json',
  { eager: true, import: 'default' },
);

function load(): UsageSummary | null {
  const entry = Object.values(summaryModules)[0];
  if (!entry) return null;
  return UsageSummarySchema.parse(entry);
}

export const usageSummary: UsageSummary | null = load();
