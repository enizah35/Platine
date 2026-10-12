// Copie les migrations SQL générées par drizzle-kit dans dist/ (tsc ne copie que le JS).
import { cpSync } from 'node:fs';

cpSync('src/adapters/db/migrations', 'dist/adapters/db/migrations', { recursive: true });
