// `pnpm db:migrate` : applique les migrations sur DATABASE_URL.
import { createPostgresDb } from './client.js';
import { migrate } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant (voir .env.example).');
  process.exit(1);
}
const { db, close } = createPostgresDb(url, { max: 1 });
try {
  await migrate(db);
  console.log('Migrations appliquées.');
} finally {
  await close();
}
