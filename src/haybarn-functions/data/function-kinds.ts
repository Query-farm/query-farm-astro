export const functionKinds: Record<string, { label: string; meaning: string; color: string }> = {
  operator: { label: 'Operator', meaning: 'Combines or transforms operands using SQL operator syntax.', color: 'plum' },
  scalar: { label: 'Scalar', meaning: 'Computes a value from its arguments.', color: 'slate' },
  aggregate: { label: 'Aggregate', meaning: 'Combines values across a group of rows.', color: 'gold' },
  table: { label: 'Table', meaning: 'Produces rows to query in FROM.', color: 'field' },
  macro: { label: 'Macro', meaning: 'Expands a stored SQL expression.', color: 'plum' },
  table_macro: { label: 'Table macro', meaning: 'Expands a stored query that produces rows.', color: 'plum' },
  pragma: { label: 'Pragma', meaning: 'Inspects or configures the engine.', color: 'clay' },
};
