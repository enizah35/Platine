import { afterAll } from 'vitest';
import { createDrizzleRepositories } from '../../src/adapters/db/repositories/index.js';
import { createTestDb } from '../db/pglite.js';
import { describeAllRepositoryContracts } from './all.contract.js';

// Une base PGlite migrée pour tout le fichier, vidée avant chaque test.
const testDb = await createTestDb();
afterAll(() => testDb.close());

describeAllRepositoryContracts('Drizzle sur PGlite', async (clock) => {
  await testDb.reset();
  return createDrizzleRepositories(testDb.db, clock);
});
