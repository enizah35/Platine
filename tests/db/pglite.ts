import { PGlite } from '@electric-sql/pglite';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from '../../src/adapters/db/migrate.js';
import * as schema from '../../src/adapters/db/schema.js';
import type { Db } from '../../src/adapters/db/types.js';

/** Base PostgreSQL en mémoire (WASM), migrée. `reset` vide toutes les tables. */
export async function createTestDb(): Promise<{
  db: Db;
  client: PGlite;
  reset(): Promise<void>;
  close(): Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db);
  const tables = Object.values(schema)
    .filter((v) => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`);
  return {
    db,
    client,
    reset: async () => {
      await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`));
    },
    close: () => client.close(),
  };
}
