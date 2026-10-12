import type { PlayableCandidate } from '../../domain/contracts/ports.js';
import type { CatalogTrack } from '../../domain/contracts/track.js';
import { normalizeIsrc, normalizeText, primaryArtist } from '../../domain/tracks/identity.js';

let seq = 0;

/** Morceau catalogue de test ; chaque appel sans surcharge produit un morceau distinct. */
export function makeCatalogTrack(over: Partial<CatalogTrack> = {}): CatalogTrack {
  seq++;
  return {
    title: `Titre ${seq}`,
    artists: [`Artiste ${seq}`],
    durationMs: 180_000 + seq * 10_000,
    genres: [],
    explicit: false,
    externalIds: [{ provider: 'deezer', id: `dz-${seq}` }],
    ...over,
  };
}

/** Candidat audio de test. */
export function makeCandidate(over: Partial<PlayableCandidate> = {}): PlayableCandidate {
  seq++;
  return {
    source: 'fake',
    ref: `ref-${seq}`,
    engineHandle: `handle-${seq}`,
    title: `Vidéo ${seq}`,
    author: `Chaîne ${seq}`,
    durationMs: 180_000,
    score: 0.9,
    ...over,
  };
}

/** Clé de programmation des fakes : ISRC si présent, sinon « artiste – titre » normalisés. */
export function fakeTrackKey(t: Pick<CatalogTrack, 'isrc' | 'artists' | 'title'>): string {
  return normalizeIsrc(t.isrc) ?? `${normalizeText(primaryArtist(t))} - ${normalizeText(t.title)}`;
}

export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Opération annulée', 'AbortError');
}
