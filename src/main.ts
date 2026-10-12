// Composition root : env → logger → base (migrations) → dépôts → Shoukaku → Discord → santé.
import { sql } from 'drizzle-orm';
import { ShoukakuTrackLoader, YoutubeLavalinkSource } from './adapters/audio/youtube-lavalink/index.js';
import { createDrizzleRepositories, createPostgresDb, migrate } from './adapters/db/index.js';
import {
  createShoukaku,
  LAVALINK_NODE_NAME,
  lavalinkNode,
  ShoukakuPlayerEngine,
  startNodeWatchdog,
} from './adapters/engine/lavalink-shoukaku/index.js';
import { systemClock } from './adapters/system-clock.js';
import { loadDotEnvIfPresent, loadEnvOrExit, parseEnv } from './config/env.js';
import { attachCommandRouter, createDiscordClient, isGatewayReady } from './discord/client.js';
import { HistoryRecorder } from './discord/history-recorder.js';
import { createRegistry } from './discord/registry.js';
import { startHealthServer } from './ops/health.js';
import { createLogger } from './ops/logger.js';

loadDotEnvIfPresent();
const env = loadEnvOrExit(() => parseEnv(process.env));
const logger = createLogger(env.LOG_LEVEL);
let started = false;

const { db, close: closeDb } = createPostgresDb(env.DATABASE_URL);
const client = createDiscordClient();
const node = lavalinkNode({
  host: env.LAVALINK_HOST,
  port: env.LAVALINK_PORT,
  password: env.LAVALINK_PASSWORD,
});
const shoukaku = createShoukaku(client, node);
const engine = new ShoukakuPlayerEngine(shoukaku, {
  shardIdOf: (g) => client.guilds.cache.get(g)?.shardId ?? 0,
});

// La sonde répond dès maintenant (503 tant que tout n'est pas prêt).
const health = await startHealthServer(
  {
    discord: () => isGatewayReady(client),
    lavalink: () => engine.isReady(),
    database: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
    started: () => started,
  },
  { port: env.HEALTH_PORT },
);
logger.info({ port: env.HEALTH_PORT }, 'Sonde de santé à l’écoute (/healthz, /readyz)');

shoukaku.on('error', (name, err) => logger.warn({ node: name, err }, 'Lavalink : erreur'));
shoukaku.on('ready', (name, resumed) => logger.info({ node: name, resumed }, 'Lavalink : nœud connecté'));
shoukaku.on('close', (name, code, reason) =>
  logger.warn({ node: name, code, reason }, 'Lavalink : connexion fermée'),
);
shoukaku.on('reconnecting', (name, left) => logger.info({ node: name, left }, 'Lavalink : reconnexion'));
client.on('error', (err) => logger.error({ err }, 'Discord : erreur client'));
client.on('warn', (msg) => logger.warn({ msg }, 'Discord : avertissement'));
client.once('clientReady', (c) =>
  logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, 'Discord : prêt'),
);
engine.on((e) => logger.debug({ event: e }, 'Moteur : événement'));

const stopWatchdog = startNodeWatchdog(shoukaku, node, {
  onReAdd: () => logger.info({ node: LAVALINK_NODE_NAME }, 'Lavalink : nouvel essai de connexion au nœud'),
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Arrêt demandé');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  stopWatchdog();
  for (const g of [...shoukaku.players.keys()]) await engine.leave(g).catch(() => {});
  await client.destroy().catch(() => {});
  await health.close().catch(() => {});
  await closeDb().catch(() => {});
  logger.info('Arrêt propre terminé');
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Promesse rejetée non gérée'));

try {
  await migrate(db);
  logger.info('Base : migrations appliquées');
  const repos = createDrizzleRepositories(db, systemClock);
  const recorder = new HistoryRecorder(repos.history, engine, systemClock, logger);
  const registry = createRegistry({
    engine,
    audio: new YoutubeLavalinkSource(new ShoukakuTrackLoader(shoukaku)),
    tracks: repos.tracks,
    history: repos.history,
    settings: repos.settings,
    clock: systemClock,
    recorder,
    logger,
  });
  attachCommandRouter(client, registry, logger);
  await client.login(env.DISCORD_TOKEN);
  started = true;
} catch (err) {
  logger.fatal({ err }, 'Démarrage impossible');
  await health.close().catch(() => {});
  await closeDb().catch(() => {});
  process.exit(1);
}
