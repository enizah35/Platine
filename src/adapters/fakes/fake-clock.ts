import type { Clock } from '../../domain/contracts/ports.js';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/**
 * Horloge manuelle. Le temps n'avance que par `advance(ms)` / `advanceAsync(ms)` / `set(date)`,
 * qui déclenchent les minuteries échues dans l'ordre (échéance, puis ordre de création).
 * Pendant un rappel, `now()` vaut l'échéance de la minuterie ; une minuterie créée par un rappel
 * et échue dans la fenêtre est elle aussi déclenchée.
 */
export class FakeClock implements Clock {
  private current: number;
  private timers: Timer[] = [];
  private nextId = 1;

  constructor(start: Date | string | number = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  setTimeout(fn: () => void, ms: number): () => void {
    const timer: Timer = { id: this.nextId++, at: this.current + Math.max(0, ms), fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((t) => t !== timer);
    };
  }

  /** Avance de `ms` en déclenchant les minuteries de façon synchrone. */
  advance(ms: number): void {
    if (ms < 0) throw new RangeError('FakeClock.advance : durée négative');
    const target = this.current + ms;
    for (let t = this.popDue(target); t; t = this.popDue(target)) {
      this.current = t.at;
      t.fn();
    }
    this.current = target;
  }

  /** Comme `advance`, mais laisse les promesses se résoudre après chaque minuterie (code async du domaine). */
  async advanceAsync(ms: number): Promise<void> {
    if (ms < 0) throw new RangeError('FakeClock.advanceAsync : durée négative');
    const target = this.current + ms;
    await flushMicrotasks();
    for (let t = this.popDue(target); t; t = this.popDue(target)) {
      this.current = t.at;
      t.fn();
      await flushMicrotasks();
    }
    this.current = target;
  }

  /** Va à une date (vers l'avant uniquement). */
  set(date: Date | string | number): void {
    this.advance(new Date(date).getTime() - this.current);
  }

  /** Avance jusqu'à la prochaine minuterie et la déclenche ; rend false s'il n'y en a pas. */
  runNext(): boolean {
    const next = this.sorted()[0];
    if (!next) return false;
    this.advance(next.at - this.current);
    return true;
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  private sorted(): Timer[] {
    return [...this.timers].sort((a, b) => a.at - b.at || a.id - b.id);
  }

  private popDue(target: number): Timer | undefined {
    const due = this.sorted()[0];
    if (!due || due.at > target) return undefined;
    this.timers = this.timers.filter((t) => t !== due);
    return due;
  }
}

/** Laisse s'exécuter les continuations de promesses en attente. */
export async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
