import { format } from 'sql-formatter';

const formatted = new Map<string, string>();

// Build-time presentation only; catalog records and exports keep the original SQL.
export function formatSQL(sql: string): string {
  if (!formatted.has(sql)) {
    try {
      formatted.set(sql, format(sql, { language: 'duckdb', tabWidth: 2, expressionWidth: 64 }));
    } catch {
      // Future engine syntax may precede formatter support. Still show its source.
      console.warn('SQL formatting unavailable for a catalog definition; displaying the original SQL.');
      formatted.set(sql, sql);
    }
  }
  return formatted.get(sql)!;
}
