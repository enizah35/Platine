import type { Clock } from '../domain/contracts/ports.js';

/** Horloge réelle (production). En test : `FakeClock`. */
export const systemClock: Clock = {
  now: () => new Date(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};
