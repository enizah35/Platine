import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

export type Schema = typeof schema;
/** Base Drizzle, quel que soit le pilote (postgres.js en production, PGlite en test). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
