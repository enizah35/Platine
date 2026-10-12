import type { CatalogProvider } from '../../domain/contracts/ports.js';
import type { CatalogTrack } from '../../domain/contracts/track.js';
import { normalizeText } from '../../domain/tracks/identity.js';
import { abortError, fakeTrackKey } from './fixtures.js';

export type FakeCatalogCall =
  | { method: 'search'; query: string; limit: number }
  | { method: 'resolveUrl'; url: string }
  | { method: 'related'; seed: CatalogTrack; limit: number };

/**
 * Catalogue programmable. Les requêtes sont comparées après normalisation (casse, accents, ponctuation).
 * Une requête non programmée rend `[]` ; une URL non programmée rend `null` (« pas pour moi »).
 */
export class FakeCatalog implements CatalogProvider {
  readonly calls: FakeCatalogCall[] = [];
  private readonly searches = new Map<string, CatalogTrack[]>();
  private readonly urls = new Map<string, CatalogTrack[]>();
  private readonly relatedBySeed = new Map<string, CatalogTrack[]>();
  private defaultRelated: CatalogTrack[] = [];
  private readonly failures = new Map<FakeCatalogCall['method'], Error>();

  constructor(readonly id: 'deezer' | 'spotify' = 'deezer') {}

  setSearch(query: string, results: CatalogTrack[]): this {
    this.searches.set(normalizeText(query), results);
    return this;
  }

  setUrl(url: string, results: CatalogTrack[]): this {
    this.urls.set(url, results);
    return this;
  }

  /** Morceaux liés à `seed` ; sans graine programmée, `setDefaultRelated` s'applique. */
  setRelated(seed: CatalogTrack, results: CatalogTrack[]): this {
    this.relatedBySeed.set(fakeTrackKey(seed), results);
    return this;
  }

  setDefaultRelated(results: CatalogTrack[]): this {
    this.defaultRelated = results;
    return this;
  }

  /** Fait échouer toutes les prochaines invocations de `method` (null pour rétablir). */
  failWith(method: FakeCatalogCall['method'], error: Error | null): this {
    if (error) this.failures.set(method, error);
    else this.failures.delete(method);
    return this;
  }

  async search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<CatalogTrack[]> {
    this.calls.push({ method: 'search', query, limit: opts.limit });
    if (opts.signal?.aborted) throw abortError(opts.signal);
    this.throwIfFailing('search');
    return clone((this.searches.get(normalizeText(query)) ?? []).slice(0, opts.limit));
  }

  async resolveUrl(url: string): Promise<CatalogTrack[] | null> {
    this.calls.push({ method: 'resolveUrl', url });
    this.throwIfFailing('resolveUrl');
    const r = this.urls.get(url);
    return r ? clone(r) : null;
  }

  async related(seed: CatalogTrack, opts: { limit: number }): Promise<CatalogTrack[]> {
    this.calls.push({ method: 'related', seed, limit: opts.limit });
    this.throwIfFailing('related');
    return clone((this.relatedBySeed.get(fakeTrackKey(seed)) ?? this.defaultRelated).slice(0, opts.limit));
  }

  private throwIfFailing(method: FakeCatalogCall['method']): void {
    const e = this.failures.get(method);
    if (e) throw e;
  }
}

function clone<T>(v: T): T {
  return structuredClone(v);
}
