import type { AudioSource, Clock, PlayableCandidate } from '../../domain/contracts/ports.js';
import type { CatalogTrack } from '../../domain/contracts/track.js';
import { systemClock } from '../system-clock.js';
import { abortError, fakeTrackKey } from './fixtures.js';

interface Program {
  candidates: PlayableCandidate[];
  error?: Error;
  delayMs?: number;
}

export type FakeAudioSourceCall =
  | { method: 'findCandidates'; track: CatalogTrack; limit: number }
  | { method: 'fromRef'; ref: string };

/**
 * Source audio programmable : candidats par morceau, échecs, lenteurs (via `Clock`, donc `FakeClock` en test).
 * Les morceaux sont reconnus par ISRC, sinon par « artiste – titre » normalisés. Un morceau non programmé
 * rend les candidats par défaut (`[]` au départ). `fromRef` retrouve tout candidat déjà programmé.
 */
export class FakeAudioSource implements AudioSource {
  readonly calls: FakeAudioSourceCall[] = [];
  private readonly programs = new Map<string, Program>();
  private readonly refs = new Map<string, PlayableCandidate | null>();
  private fallback: Program = { candidates: [] };
  private readonly clock: Clock;

  constructor(
    readonly id: string = 'fake',
    opts: { clock?: Clock } = {},
  ) {
    this.clock = opts.clock ?? systemClock;
  }

  setCandidates(track: CatalogTrack, candidates: PlayableCandidate[], opts: { delayMs?: number } = {}): this {
    this.programs.set(fakeTrackKey(track), { candidates, ...opts });
    for (const c of candidates) this.refs.set(c.ref, c);
    return this;
  }

  /** `findCandidates` échoue pour ce morceau (après `delayMs` éventuel). */
  failFor(track: CatalogTrack, error: Error, opts: { delayMs?: number } = {}): this {
    this.programs.set(fakeTrackKey(track), { candidates: [], error, ...opts });
    return this;
  }

  /** Comportement pour les morceaux non programmés. */
  setDefault(p: { candidates?: PlayableCandidate[]; error?: Error; delayMs?: number }): this {
    this.fallback = {
      candidates: p.candidates ?? [],
      ...(p.error ? { error: p.error } : {}),
      ...(p.delayMs !== undefined ? { delayMs: p.delayMs } : {}),
    };
    for (const c of this.fallback.candidates) this.refs.set(c.ref, c);
    return this;
  }

  /** Programme `fromRef` (null = référence morte). */
  setRef(ref: string, candidate: PlayableCandidate | null): this {
    this.refs.set(ref, candidate);
    return this;
  }

  async findCandidates(
    track: CatalogTrack,
    opts: { limit: number; signal?: AbortSignal },
  ): Promise<PlayableCandidate[]> {
    this.calls.push({ method: 'findCandidates', track, limit: opts.limit });
    const p = this.programs.get(fakeTrackKey(track)) ?? this.fallback;
    if (opts.signal?.aborted) throw abortError(opts.signal);
    if (p.delayMs !== undefined && p.delayMs > 0) await this.sleep(p.delayMs, opts.signal);
    if (p.error) throw p.error;
    return p.candidates.slice(0, opts.limit).map((c) => ({ ...c }));
  }

  async fromRef(ref: string): Promise<PlayableCandidate | null> {
    this.calls.push({ method: 'fromRef', ref });
    const c = this.refs.get(ref);
    return c ? { ...c } : null;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        cancel();
        reject(abortError(signal as AbortSignal));
      };
      const cancel = this.clock.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
