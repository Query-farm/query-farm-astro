import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Run the actual migration and SQL against SQLite rather than matching SQL
// strings in mocks. This exercises constraints, rollback and duplicate inserts.
export function enquiryDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/enquiry/0001_enquiry_delivery.sql', import.meta.url), 'utf8'));
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    run: async () => { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
  });
  return {
    sqlite,
    prepare: statement,
    batch: async statements => {
      sqlite.exec('BEGIN');
      try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
