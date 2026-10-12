import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Aucun test ne doit dépendre du réseau (Discord, YouTube, Deezer).
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/migrations/**',
        'src/adapters/db/migrate-cli.ts',
        'src/adapters/db/client.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        // Tâche 0.3 : dépôts ≥ 80 %. Les seuils globaux (§7 : 70 % global, 85 % domain) arrivent avec le code métier.
        'src/adapters/db/repositories/**': { lines: 80, statements: 80, functions: 80, branches: 80 },
        'src/adapters/fakes/**': { lines: 80, statements: 80 },
      },
    },
  },
});
