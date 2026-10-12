import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/db/schema.ts',
  out: './src/adapters/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://platine:platine@localhost:5432/platine' },
  strict: true,
  verbose: true,
});
