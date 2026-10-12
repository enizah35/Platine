// Identité d'un morceau : règles de dédoublonnage partagées par tous les TrackRepository (plan §4).
import type { CatalogTrack, Track } from '../contracts/track.js';

/** Tolérance de durée pour considérer deux morceaux sans ISRC comme identiques. */
export const SAME_TRACK_DURATION_TOLERANCE_MS = 3_000;

/** Minuscules, sans accents ni ponctuation, espaces réduits. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeIsrc(isrc: string | undefined | null): string | null {
  if (!isrc) return null;
  const v = isrc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return v.length > 0 ? v : null;
}

export function primaryArtist(t: Pick<CatalogTrack, 'artists'>): string {
  return t.artists[0] ?? '';
}

/** Même artiste principal et même titre normalisés, durée à ±3 s. */
export function isSameTrackFuzzy(
  a: Pick<CatalogTrack, 'artists' | 'title' | 'durationMs'>,
  b: Pick<CatalogTrack, 'artists' | 'title' | 'durationMs'>,
): boolean {
  return (
    Math.abs(a.durationMs - b.durationMs) <= SAME_TRACK_DURATION_TOLERANCE_MS &&
    normalizeText(primaryArtist(a)) === normalizeText(primaryArtist(b)) &&
    normalizeText(a.title) === normalizeText(b.title)
  );
}

/**
 * Fusionne un morceau catalogue dans un morceau déjà connu : complète les champs manquants
 * (ISRC, album, pochette, genres) et ajoute les identifiants externes absents. Ne remplace rien.
 */
export function mergeTrack(existing: Track, incoming: CatalogTrack): Track {
  const merged: Track = { ...existing, externalIds: [...existing.externalIds] };
  const isrc = normalizeIsrc(incoming.isrc);
  if (merged.isrc === undefined && isrc !== null) merged.isrc = isrc;
  if (merged.album === undefined && incoming.album) merged.album = incoming.album;
  if (merged.artworkUrl === undefined && incoming.artworkUrl) merged.artworkUrl = incoming.artworkUrl;
  if (merged.genres.length === 0 && incoming.genres.length > 0) merged.genres = [...incoming.genres];
  for (const x of incoming.externalIds) {
    if (!merged.externalIds.some((y) => y.provider === x.provider && y.id === x.id)) {
      merged.externalIds.push({ ...x });
    }
  }
  return merged;
}
