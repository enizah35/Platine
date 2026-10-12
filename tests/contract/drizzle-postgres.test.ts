// Suites de contrat contre un vrai PostgreSQL (ex. celui du docker-compose). Ignoré sans TEST_DATABASE_URL.
// ATTENTION : la base indiquée est VIDÉE (TRUNCATE) avant chaque test. Ne jamais pointer vers la prod.
// Exemple : TEST_DATABASE_URL=postgres://platine:platine@localhost:5432/platine_test pnpm test
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, describe, it } from 'vitest';
import { createPostgresDb } from '../../src/adapters/db/client.js';
import { migrate } from '../../src/adapters/db/migrate.js';
import { createDrizzleRepositories } from '../../src/adapters/db/repositories/index.js';
import * as schema from '../../src/adapters/db/schema.js';
import { describeAllRepositoryContracts } from './all.contract.js';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe.skip('Drizzle sur PostgreSQL (TEST_DATABASE_URL absent)', () => {
    it('ignoré', () => {});
  });
} else {
  const { db, close } = createPostgresDb(url, { max: 1 });
  await migrate(db);
  afterAll(close);
  const tables = Object.values(schema)
    .filter((v) => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`)
    .join(', ');
  describeAllRepositoryContracts('Drizzle sur PostgreSQL', async (clock) => {
    await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
    return createDrizzleRepositories(db, clock);
  });
}
