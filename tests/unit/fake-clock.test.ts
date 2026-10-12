import { describe, expect, it } from 'vitest';
import { FakeClock, flushMicrotasks } from '../../src/adapters/fakes/fake-clock.js';

describe('FakeClock', () => {
  it('ne bouge que si on l’avance', () => {
    const c = new FakeClock('2026-01-01T00:00:00Z');
    expect(c.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    c.advance(1500);
    expect(c.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
    expect(() => c.advance(-1)).toThrow(RangeError);
  });

  it('déclenche les minuteries échues dans l’ordre, à leur échéance', () => {
    const c = new FakeClock(0);
    const log: string[] = [];
    c.setTimeout(() => log.push(`b@${c.now().getTime()}`), 200);
    c.setTimeout(() => log.push(`a@${c.now().getTime()}`), 100);
    c.setTimeout(() => log.push(`a2@${c.now().getTime()}`), 100);
    c.setTimeout(() => log.push('tard'), 1_000);
    c.advance(250);
    expect(log).toEqual(['a@100', 'a2@100', 'b@200']);
    expect(c.now().getTime()).toBe(250);
    expect(c.pendingTimers).toBe(1);
  });

  it('déclenche aussi les minuteries créées pendant la fenêtre', () => {
    const c = new FakeClock(0);
    const log: number[] = [];
    c.setTimeout(() => {
      log.push(c.now().getTime());
      c.setTimeout(() => log.push(c.now().getTime()), 50);
    }, 100);
    c.advance(149);
    expect(log).toEqual([100]);
    c.advance(1);
    expect(log).toEqual([100, 150]);
  });

  it('annule une minuterie', () => {
    const c = new FakeClock(0);
    let fired = false;
    const cancel = c.setTimeout(() => {
      fired = true;
    }, 10);
    cancel();
    c.advance(100);
    expect(fired).toBe(false);
    expect(c.pendingTimers).toBe(0);
  });

  it('set et runNext', () => {
    const c = new FakeClock(0);
    const log: number[] = [];
    c.setTimeout(() => log.push(1), 5_000);
    expect(c.runNext()).toBe(true);
    expect(c.now().getTime()).toBe(5_000);
    expect(c.runNext()).toBe(false);
    c.set(10_000);
    expect(c.now().getTime()).toBe(10_000);
    expect(log).toEqual([1]);
  });

  it('advanceAsync laisse le code async s’exécuter entre deux minuteries', async () => {
    const c = new FakeClock(0);
    const log: string[] = [];
    const sleep = (ms: number) => new Promise<void>((r) => c.setTimeout(r, ms));
    void (async () => {
      await sleep(100);
      log.push(`1@${c.now().getTime()}`);
      await sleep(100);
      log.push(`2@${c.now().getTime()}`);
    })();
    await c.advanceAsync(250);
    expect(log).toEqual(['1@100', '2@200']);
    await expect(c.advanceAsync(-1)).rejects.toThrow(RangeError);
    await flushMicrotasks();
  });
});
