import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import type { Db } from './types.js';

/** Connexion PostgreSQL de production (postgres.js). */
export function createPostgresDb(
  url: string,
  opts: { max?: number } = {},
): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max: opts.max ?? 5, onnotice: () => {} });
  const db = drizzle({ client, schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
