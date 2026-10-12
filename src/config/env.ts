// Validation du `.env` (plan §2 : zod, échec immédiat et lisible si un secret manque).
import { existsSync } from 'node:fs';
import { z } from 'zod';

const nonEmpty = (name: string) =>
  z.string({ error: `${name} manquant` }).trim().min(1, { error: `${name} manquant ou vide` });

const port = (name: string, fallback: number) =>
  z.coerce
    .number({ error: `${name} doit être un nombre` })
    .int({ error: `${name} doit être un entier` })
    .min(1, { error: `${name} doit être entre 1 et 65535` })
    .max(65_535, { error: `${name} doit être entre 1 et 65535` })
    .default(fallback);

const snowflake = (name: string) =>
  nonEmpty(name).regex(/^\d{17,20}$/, { error: `${name} doit être un identifiant Discord (17 à 20 chiffres)` });

/** Variables nécessaires pour enregistrer les commandes (`pnpm deploy:commands`). */
export const discordEnvSchema = z.object({
  DISCORD_TOKEN: nonEmpty('DISCORD_TOKEN'),
  DISCORD_CLIENT_ID: snowflake('DISCORD_CLIENT_ID'),
  DISCORD_GUILD_ID: snowflake('DISCORD_GUILD_ID'),
});

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Toutes les variables du bot (voir `.env.example`). */
export const envSchema = discordEnvSchema.extend({
  LAVALINK_HOST: nonEmpty('LAVALINK_HOST').default('127.0.0.1'),
  LAVALINK_PORT: port('LAVALINK_PORT', 2333),
  LAVALINK_PASSWORD: nonEmpty('LAVALINK_PASSWORD'),
  DATABASE_URL: nonEmpty('DATABASE_URL').regex(/^postgres(ql)?:\/\//, {
    error: 'DATABASE_URL doit commencer par postgres:// ou postgresql://',
  }),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: `LOG_LEVEL doit valoir ${LOG_LEVELS.join(', ')}` }).default('info'),
  HEALTH_PORT: port('HEALTH_PORT', 8080),
});

export type DiscordEnv = z.infer<typeof discordEnvSchema>;
export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override readonly name = 'EnvError';
  constructor(readonly problems: string[]) {
    super(
      `Configuration invalide (.env) :\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Copier .env.example en .env et remplir les valeurs (voir docs/setup-windows.md §3).',
    );
  }
}

/** Valide `source` (par défaut `process.env`) contre `schema`. Lève `EnvError` avec la liste des problèmes. */
export function parseEnv<S extends z.ZodType>(
  source: Record<string, string | undefined>,
  schema: S,
): z.infer<S>;
export function parseEnv(source: Record<string, string | undefined>): Env;
export function parseEnv(source: Record<string, string | undefined>, schema: z.ZodType = envSchema): unknown {
  // Une variable vide dans `.env` (`DISCORD_TOKEN=`) compte comme absente : le défaut s'applique ou l'erreur sort.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const r = schema.safeParse(cleaned);
  if (r.success) return r.data;
  throw new EnvError(r.error.issues.map((i) => i.message));
}

/**
 * Charge `.env` s'il existe (bot lancé hors conteneur, `pnpm dev`). Les variables déjà définies dans
 * l'environnement gardent leur valeur (docker compose les fournit déjà, l'image ne contient pas de `.env`).
 */
export function loadDotEnvIfPresent(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

/** Exécute `read` (ex. `() => parseEnv(process.env)`) ; affiche un message lisible et quitte (code 1) si invalide. */
export function loadEnvOrExit<T>(read: () => T): T {
  try {
    return read();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}
