import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  type PlayerPort,
  ShoukakuPlayerEngine,
  type ShoukakuPort,
  startNodeWatchdog,
  translatePlayerEvent,
} from '../../src/adapters/engine/lavalink-shoukaku/index.js';
import { makeCandidate } from '../../src/adapters/fakes/index.js';
import { isDomainError } from '../../src/domain/contracts/errors.js';
import type { EngineEvent } from '../../src/domain/contracts/ports.js';

class FakePlayer extends EventEmitter implements PlayerPort {
  position = 0;
  readonly calls: unknown[] = [];
  constructor(readonly guildId: string) {
    super();
  }
  async playTrack(o: unknown) {
    this.calls.push(['playTrack', o]);
  }
  async stopTrack() {
    this.calls.push(['stopTrack']);
  }
  async setPaused(p?: boolean) {
    this.calls.push(['setPaused', p]);
  }
  async seekTo(n: number) {
    this.calls.push(['seekTo', n]);
  }
}

class FakeShoukaku extends EventEmitter implements ShoukakuPort {
  readonly nodes = new Map<string, { state: number }>([['main', { state: 1 }]]);
  readonly connections = new Map<string, { channelId: string | null }>();
  readonly players = new Map<string, FakePlayer>();
  readonly joins: unknown[] = [];
  readonly leaves: string[] = [];
  async joinVoiceChannel(o: { guildId: string; channelId: string; shardId: number }) {
    this.joins.push(o);
    const p = new FakePlayer(o.guildId);
    this.connections.set(o.guildId, { channelId: o.channelId });
    this.players.set(o.guildId, p);
    return p;
  }
  async leaveVoiceChannel(g: string) {
    this.leaves.push(g);
    this.connections.delete(g);
    this.players.get(g)?.removeAllListeners();
    this.players.delete(g);
  }
  setNodeState(state: number) {
    this.nodes.set('main', { state });
  }
}

function setup() {
  const sk = new FakeShoukaku();
  const engine = new ShoukakuPlayerEngine(sk, { shardIdOf: () => 0 });
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  return { sk, engine, events };
}

describe('translatePlayerEvent', () => {
  it('traduit chaque événement Lavalink en EngineEvent', () => {
    expect(translatePlayerEvent('g', { kind: 'start', data: { guildId: 'g' } })).toEqual({
      type: 'trackStart',
      guildId: 'g',
    });
    expect(translatePlayerEvent('g', { kind: 'end', data: { guildId: 'g', reason: 'loadFailed' } })).toEqual({
      type: 'trackEnd',
      guildId: 'g',
      reason: 'loadFailed',
    });
    expect(
      translatePlayerEvent('g', {
        kind: 'exception',
        data: { guildId: 'g', exception: { message: 'Sign in', severity: 'suspicious', cause: 'x' } },
      }),
    ).toEqual({ type: 'trackException', guildId: 'g', message: 'Sign in', severity: 'suspicious' });
    expect(translatePlayerEvent('g', { kind: 'stuck', data: { guildId: 'g', thresholdMs: 10_000 } })).toEqual(
      {
        type: 'trackStuck',
        guildId: 'g',
        thresholdMs: 10_000,
      },
    );
    expect(
      translatePlayerEvent('g', { kind: 'closed', data: { guildId: 'g', code: 4014, byRemote: true } }),
    ).toEqual({ type: 'voiceClosed', guildId: 'g', code: 4014, byRemote: true });
  });
});

describe('ShoukakuPlayerEngine', () => {
  it('rejoint, joue le handle encodé et relaie les événements du lecteur', async () => {
    const { sk, engine, events } = setup();
    await engine.join('g1', 'vc1');
    expect(sk.joins).toEqual([{ guildId: 'g1', channelId: 'vc1', shardId: 0, deaf: true }]);
    await engine.play('g1', makeCandidate({ engineHandle: 'ENC' }), { startMs: 1500 });
    const p = sk.players.get('g1');
    expect(p?.calls).toEqual([['playTrack', { track: { encoded: 'ENC' }, position: 1500 }]]);

    p?.emit('start', { guildId: 'g1' });
    p?.emit('end', { guildId: 'g1', reason: 'finished' });
    p?.emit('exception', { guildId: 'g1', exception: { message: 'boom', severity: 'common', cause: '' } });
    p?.emit('stuck', { guildId: 'g1', thresholdMs: 10000 });
    p?.emit('closed', { guildId: 'g1', code: 4006, byRemote: true });
    expect(events).toEqual([
      { type: 'trackStart', guildId: 'g1' },
      { type: 'trackEnd', guildId: 'g1', reason: 'finished' },
      { type: 'trackException', guildId: 'g1', message: 'boom', severity: 'common' },
      { type: 'trackStuck', guildId: 'g1', thresholdMs: 10000 },
      { type: 'voiceClosed', guildId: 'g1', code: 4006, byRemote: true },
    ]);
    if (p) p.position = 4200;
    expect(engine.position('g1')).toBe(4200);
    expect(engine.position('autre')).toBeNull();
  });

  it('ne recrée pas la connexion dans le même salon ; change de salon sinon', async () => {
    const { sk, engine } = setup();
    await engine.join('g1', 'vc1');
    await engine.join('g1', 'vc1');
    expect(sk.joins).toHaveLength(1);
    await engine.join('g1', 'vc2');
    expect(sk.leaves).toEqual(['g1']);
    expect(sk.joins).toHaveLength(2);
  });

  it('nodeDown / nodeUp et recréation des lecteurs après une session Lavalink perdue', async () => {
    const { sk, engine, events } = setup();
    await engine.join('g1', 'vc1');
    sk.emit('ready', 'main', false, false); // premier ready : pas de nodeDown avant
    sk.emit('close', 'main', 1006, '');
    sk.emit('close', 'main', 1006, ''); // dédoublonné
    sk.emit('ready', 'main', false, false);
    expect(events).toEqual([
      { type: 'nodeUp', resumed: false },
      { type: 'nodeDown' },
      { type: 'nodeUp', resumed: false },
    ]);
    await engine.join('g1', 'vc1'); // session perdue : nouvelle connexion
    expect(sk.joins).toHaveLength(2);
    sk.emit('ready', 'main', true, false);
    expect(events.at(-1)).toEqual({ type: 'nodeUp', resumed: true });
  });

  it('isReady reflète l’état du nœud ; commandes en ENGINE_UNAVAILABLE sans nœud', async () => {
    const { sk, engine } = setup();
    expect(engine.isReady()).toBe(true);
    await engine.join('g1', 'vc1');
    sk.setNodeState(0);
    expect(engine.isReady()).toBe(false);
    for (const op of [
      () => engine.join('g1', 'vc1'),
      () => engine.play('g1', makeCandidate()),
      () => engine.stop('g1'),
      () => engine.pause('g1', true),
      () => engine.seek('g1', 0),
    ]) {
      await expect(op()).rejects.toSatisfy((e) => isDomainError(e, 'ENGINE_UNAVAILABLE'));
    }
    sk.nodes.clear();
    expect(engine.isReady()).toBe(false);
  });

  it('pause, seek, stop et leave délèguent au lecteur', async () => {
    const { sk, engine } = setup();
    await engine.join('g1', 'vc1');
    await engine.pause('g1', true);
    await engine.seek('g1', 12.7);
    await engine.stop('g1');
    expect(sk.players.get('g1')?.calls).toEqual([['setPaused', true], ['seekTo', 12], ['stopTrack']]);
    await engine.leave('g1');
    expect(sk.players.has('g1')).toBe(false);
    await expect(engine.play('g1', makeCandidate())).rejects.toThrow(/join/);
  });

  it('un auditeur défaillant ne bloque pas les autres ; désabonnement', async () => {
    const { sk, engine, events } = setup();
    engine.on(() => {
      throw new Error('auditeur cassé');
    });
    const off = engine.on(() => {});
    off();
    sk.emit('ready', 'main', true, false);
    expect(events).toEqual([{ type: 'nodeUp', resumed: true }]);
  });
});

describe('startNodeWatchdog', () => {
  it('ré-ajoute le nœud abandonné par Shoukaku', () => {
    vi.useFakeTimers();
    try {
      const nodes = new Map<string, unknown>();
      const sk = { nodes, id: 'bot', addNode: vi.fn() };
      const stop = startNodeWatchdog(
        sk as never,
        { name: 'main', url: 'h:1', auth: 'x' },
        { intervalMs: 1000 },
      );
      vi.advanceTimersByTime(1000);
      expect(sk.addNode).toHaveBeenCalledTimes(1);
      nodes.set('main', {});
      vi.advanceTimersByTime(3000);
      expect(sk.addNode).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
