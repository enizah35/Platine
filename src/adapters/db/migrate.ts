import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect, type PgSession } from 'drizzle-orm/pg-core';
import type { Db } from './types.js';

/** Dossier des migrations générées par drizzle-kit (copié dans `dist/` par `pnpm build`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Applique les migrations en attente (idempotent). Fonctionne avec tout pilote Drizzle PostgreSQL :
 * c'est ce que font `drizzle-orm/{pglite,postgres-js}/migrator`, sans en dépendre.
 */
export async function migrate(db: Db, migrationsFolder: string = MIGRATIONS_FOLDER): Promise<void> {
  const config = { migrationsFolder };
  // `PgDialect.migrate` attend une session sans schéma typé : le cast ne porte que sur le générique.
  await new PgDialect().migrate(readMigrationFiles(config), db._.session as unknown as PgSession, config);
}
