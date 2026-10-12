// Sondes de santé (plan §2 : node:http minimal, pas de framework).
//  - GET /healthz : 200 si la gateway Discord est prête ET le nœud Lavalink connecté ET la base répond, sinon 503.
//  - GET /readyz  : 200 quand le démarrage est terminé (migrations appliquées, connexion Discord lancée), sinon 503.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface HealthProbes {
  /** Gateway Discord connectée et prête. */
  discord(): boolean;
  /** Nœud Lavalink connecté (`PlayerEngine.isReady()`). */
  lavalink(): boolean;
  /** La base répond à `select 1`. */
  database(): Promise<boolean>;
  /** Démarrage terminé. */
  started(): boolean;
}

export interface HealthReport {
  ok: boolean;
  checks: { discord: boolean; lavalink: boolean; database: boolean };
}

const DB_TIMEOUT_MS = 2_000;

async function withTimeout(p: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([p.catch(() => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const safe = (f: () => boolean): boolean => {
  try {
    return f();
  } catch {
    return false;
  }
};

export async function checkHealth(
  probes: HealthProbes,
  opts: { dbTimeoutMs?: number } = {},
): Promise<HealthReport> {
  const checks = {
    discord: safe(() => probes.discord()),
    lavalink: safe(() => probes.lavalink()),
    database: await withTimeout(
      Promise.resolve().then(() => probes.database()),
      opts.dbTimeoutMs ?? DB_TIMEOUT_MS,
    ),
  };
  return { ok: checks.discord && checks.lavalink && checks.database, checks };
}

export interface HealthServer {
  readonly server: Server;
  /** Port réellement écouté (utile avec le port 0 en test). */
  port(): number;
  close(): Promise<void>;
}

export async function startHealthServer(
  probes: HealthProbes,
  opts: { port: number; host?: string; dbTimeoutMs?: number },
): Promise<HealthServer> {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'method not allowed' });
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/healthz') {
      checkHealth(probes, opts).then(
        (r) => send(r.ok ? 200 : 503, { status: r.ok ? 'ok' : 'unhealthy', checks: r.checks }),
        () => send(503, { status: 'unhealthy' }),
      );
      return;
    }
    if (path === '/readyz') {
      const ready = safe(() => probes.started());
      return send(ready ? 200 : 503, { status: ready ? 'ready' : 'starting' });
    }
    send(404, { error: 'not found' });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    server,
    port: () => (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
