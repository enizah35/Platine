import { afterEach, describe, expect, it } from 'vitest';
import {
  checkHealth,
  type HealthProbes,
  type HealthServer,
  startHealthServer,
} from '../../src/ops/health.js';

const probes = (over: Partial<HealthProbes> = {}): HealthProbes => ({
  discord: () => true,
  lavalink: () => true,
  database: async () => true,
  started: () => true,
  ...over,
});

describe('checkHealth', () => {
  it('ok seulement si les trois sondes sont vertes', async () => {
    expect(await checkHealth(probes())).toEqual({
      ok: true,
      checks: { discord: true, lavalink: true, database: true },
    });
    expect((await checkHealth(probes({ lavalink: () => false }))).ok).toBe(false);
  });

  it('une sonde qui lève, rejette ou traîne compte comme rouge', async () => {
    const r = await checkHealth(
      probes({
        discord: () => {
          throw new Error('x');
        },
        database: () => new Promise<boolean>(() => {}),
      }),
      { dbTimeoutMs: 20 },
    );
    expect(r).toEqual({ ok: false, checks: { discord: false, lavalink: true, database: false } });
    expect((await checkHealth(probes({ database: async () => Promise.reject(new Error('db')) }))).ok).toBe(
      false,
    );
  });
});

describe('serveur de santé', () => {
  let srv: HealthServer | undefined;
  afterEach(async () => {
    await srv?.close();
    srv = undefined;
  });

  const get = async (path: string) => {
    const r = await fetch(`http://127.0.0.1:${srv?.port()}${path}`);
    return { status: r.status, body: await r.json() };
  };

  it('/healthz : 200 quand tout va bien, 503 avec le détail sinon', async () => {
    let lavalinkUp = true;
    srv = await startHealthServer(probes({ lavalink: () => lavalinkUp }), { port: 0, host: '127.0.0.1' });
    expect(await get('/healthz')).toEqual({
      status: 200,
      body: { status: 'ok', checks: { discord: true, lavalink: true, database: true } },
    });
    lavalinkUp = false;
    expect(await get('/healthz')).toEqual({
      status: 503,
      body: { status: 'unhealthy', checks: { discord: true, lavalink: false, database: true } },
    });
  });

  it('/readyz suit le démarrage ; 404 ailleurs', async () => {
    let started = false;
    srv = await startHealthServer(probes({ started: () => started }), { port: 0, host: '127.0.0.1' });
    expect(await get('/readyz')).toEqual({ status: 503, body: { status: 'starting' } });
    started = true;
    expect(await get('/readyz')).toEqual({ status: 200, body: { status: 'ready' } });
    expect((await get('/nope')).status).toBe(404);
  });
});
