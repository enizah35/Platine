import { describe, expect, it } from 'vitest';
import { FakePlayerEngine } from '../../src/adapters/fakes/fake-player-engine.js';
import { makeCandidate } from '../../src/adapters/fakes/fixtures.js';
import type { EngineEvent } from '../../src/domain/contracts/ports.js';
import { isDomainError } from '../../src/domain/index.js';

describe('FakePlayerEngine', () => {
  it('enregistre les appels et tient l’état par serveur', async () => {
    const e = new FakePlayerEngine();
    const c = makeCandidate();
    await e.join('g1', 'v1');
    await e.play('g1', c, { startMs: 30_000 });
    expect(e.position('g1')).toBe(30_000);
    await e.pause('g1', true);
    await e.seek('g1', 45_000);
    expect(e.state('g1')).toEqual({ voiceChannelId: 'v1', current: c, paused: true });
    expect(e.position('g1')).toBe(45_000);
    e.setPosition('g1', 50_000);
    expect(e.position('g1')).toBe(50_000);
    await e.stop('g1');
    expect(e.state('g1')?.current).toBeNull();
    expect(e.position('g1')).toBeNull();
    await e.play('g1', c);
    await e.leave('g1');
    expect(e.state('g1')).toBeUndefined();
    expect(e.calls.map((x) => x.method)).toEqual(['join', 'play', 'pause', 'seek', 'stop', 'play', 'leave']);
    expect(e.callsOf('play')).toEqual([
      { method: 'play', guildId: 'g1', candidate: c, opts: { startMs: 30_000 } },
      { method: 'play', guildId: 'g1', candidate: c },
    ]);
    e.setPosition('g2', 1);
    e.setPosition('g2', null);
    expect(e.position('g2')).toBeNull();
  });

  it('diffuse les événements émis par le test, jusqu’au désabonnement', () => {
    const e = new FakePlayerEngine();
    const seen: EngineEvent[] = [];
    const off = e.on((ev) => seen.push(ev));
    expect(e.listenerCount).toBe(1);
    e.emit({ type: 'trackStart', guildId: 'g1' });
    e.emit({ type: 'trackEnd', guildId: 'g1', reason: 'finished' });
    off();
    e.emit({ type: 'trackStuck', guildId: 'g1', thresholdMs: 10_000 });
    expect(seen.map((x) => x.type)).toEqual(['trackStart', 'trackEnd']);
    expect(e.listenerCount).toBe(0);
  });

  it('isReady réglable ; nodeDown/nodeUp le basculent ; commandes refusées hors ligne', async () => {
    const e = new FakePlayerEngine();
    expect(e.isReady()).toBe(true);
    e.emit({ type: 'nodeDown' });
    expect(e.isReady()).toBe(false);
    const err = await e.join('g1', 'v1').catch((x: unknown) => x);
    expect(isDomainError(err, 'ENGINE_UNAVAILABLE')).toBe(true);
    e.emit({ type: 'nodeUp', resumed: false });
    expect(e.isReady()).toBe(true);
    e.setReady(false);
    expect(e.isReady()).toBe(false);
  });

  it('failNext fait échouer la prochaine invocation seulement', async () => {
    const e = new FakePlayerEngine();
    e.failNext('play', new Error('boum'));
    e.failNext('play');
    await expect(e.play('g1', makeCandidate())).rejects.toThrow('boum');
    await expect(e.play('g1', makeCandidate())).rejects.toThrow('échec simulé');
    await expect(e.play('g1', makeCandidate())).resolves.toBeUndefined();
  });
});
