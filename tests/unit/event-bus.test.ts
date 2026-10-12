import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DomainEvent, DomainEventOf } from '../../src/domain/index.js';
import { EventBus } from '../../src/domain/index.js';

const at = new Date('2026-01-01T00:00:00Z');
const queueChanged: DomainEvent = { type: 'QueueChanged', guildId: 'g1', size: 3, at };
const tick: DomainEvent = { type: 'PositionTick', guildId: 'g1', positionMs: 5_000, at };
const joined: DomainEvent = { type: 'VoiceJoined', guildId: 'g1', channelId: 'v1', at };

describe('EventBus', () => {
  it('diffuse à tous les abonnés généraux, dans l’ordre', () => {
    const bus = new EventBus();
    const log: string[] = [];
    bus.on((e) => log.push(`a:${e.type}`));
    bus.on((e) => log.push(`b:${e.type}`));
    bus.emit(queueChanged);
    expect(log).toEqual(['a:QueueChanged', 'b:QueueChanged']);
  });

  it('filtre par type avec un typage discriminé', () => {
    const bus = new EventBus();
    const sizes: number[] = [];
    bus.on('QueueChanged', (e) => {
      expectTypeOf(e).toEqualTypeOf<DomainEventOf<'QueueChanged'>>();
      sizes.push(e.size);
    });
    const voice: string[] = [];
    bus.on(['VoiceJoined', 'VoiceLeft'], (e) => voice.push(`${e.type}:${e.channelId}`));
    bus.emit(tick);
    bus.emit(queueChanged);
    bus.emit(joined);
    expect(sizes).toEqual([3]);
    expect(voice).toEqual(['VoiceJoined:v1']);
  });

  it('on rend une fonction de désabonnement', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('PositionTick', fn);
    expect(bus.listenerCount).toBe(1);
    bus.emit(tick);
    off();
    off();
    bus.emit(tick);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount).toBe(0);
  });

  it('un abonné qui lève n’empêche pas les autres', () => {
    const errors: unknown[] = [];
    const bus = new EventBus((err) => errors.push(err));
    const fn = vi.fn();
    bus.on(() => {
      throw new Error('abonné cassé');
    });
    bus.on(fn);
    bus.emit(queueChanged);
    expect(fn).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
  });

  it('par défaut, l’erreur d’un abonné est journalisée sans remonter à l’émetteur', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = new EventBus();
    bus.on(() => {
      throw new Error('cassé');
    });
    expect(() => bus.emit(queueChanged)).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('QueueChanged'), expect.any(Error));
    spy.mockRestore();
  });

  it('un abonné ajouté pendant emit ne reçoit pas l’événement en cours', () => {
    const bus = new EventBus();
    const late = vi.fn();
    bus.on(() => {
      bus.on(late);
    });
    bus.emit(queueChanged);
    expect(late).not.toHaveBeenCalled();
    bus.emit(queueChanged);
    expect(late).toHaveBeenCalledOnce();
  });

  it('refuse un abonnement filtré sans abonné', () => {
    const bus = new EventBus();
    // @ts-expect-error appel invalide volontaire
    expect(() => bus.on('QueueChanged')).toThrow(TypeError);
  });
});
