import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Aucun test ne doit dépendre du réseau (Discord, YouTube, Deezer).
    testTimeout: 10_000,
  },
});
