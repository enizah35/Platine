// AudioSource YouTube via Lavalink (plugin youtube-source), version simple de la phase 0 :
// recherche « artistes - titre », candidats dans l'ordre de YouTube, score par la durée si elle est connue.
// Le score complet (titre, artiste, chaîne « - Topic », pénalités live/remix…) arrive en phase 1 (plan §5.5).
import type { AudioSource, PlayableCandidate } from '../../../domain/contracts/ports.js';
import type { CatalogTrack } from '../../../domain/contracts/track.js';
import type { LavalinkLoadResult, LavalinkTrack, TrackLoader } from './track-loader.js';

export const YOUTUBE_SOURCE_ID = 'youtube';

/** Écart de durée au-delà duquel le score « durée » tombe à 0. */
const DURATION_SPAN_MS = 30_000;
/** Perte de score par rang quand la durée attendue est inconnue. */
const RANK_STEP = 0.1;

export class LavalinkError extends Error {
  override readonly name = 'LavalinkError';
}

/** Requête de recherche YouTube pour un morceau catalogue. */
export function searchQuery(track: Pick<CatalogTrack, 'artists' | 'title'>): string {
  const artists = track.artists.map((a) => a.trim()).filter(Boolean);
  const title = track.title.trim();
  return `ytsearch:${artists.length > 0 ? `${artists.join(', ')} - ${title}` : title}`;
}

/** Pistes contenues dans une réponse `loadtracks`. Lève `LavalinkError` sur `loadType: 'error'`. */
export function tracksOf(r: LavalinkLoadResult | undefined): LavalinkTrack[] {
  if (!r) return [];
  switch (r.loadType) {
    case 'track':
      return [r.data];
    case 'playlist':
      return r.data.tracks;
    case 'search':
      return r.data;
    case 'empty':
      return [];
    case 'error':
      throw new LavalinkError(`Lavalink : ${r.data.message} (${r.data.severity})`);
  }
}

function toCandidate(t: LavalinkTrack, score: number): PlayableCandidate {
  return {
    source: YOUTUBE_SOURCE_ID,
    ref: t.info.identifier,
    engineHandle: t.encoded,
    title: t.info.title,
    author: t.info.author,
    durationMs: t.info.length,
    score: Math.round(score * 1000) / 1000,
  };
}

/** Score simple : proximité de durée si connue (> 0), sinon rang dans les résultats. */
export function simpleScore(expectedMs: number, t: LavalinkTrack, rank: number): number {
  if (expectedMs > 0) return Math.max(0, 1 - Math.abs(t.info.length - expectedMs) / DURATION_SPAN_MS);
  return Math.max(0, 1 - rank * RANK_STEP);
}

export class YoutubeLavalinkSource implements AudioSource {
  readonly id = YOUTUBE_SOURCE_ID;

  constructor(private readonly loader: TrackLoader) {}

  async findCandidates(
    track: CatalogTrack,
    opts: { limit: number; signal?: AbortSignal },
  ): Promise<PlayableCandidate[]> {
    opts.signal?.throwIfAborted();
    const result = await this.loader.load(searchQuery(track));
    opts.signal?.throwIfAborted();
    const playable = tracksOf(result).filter((t) => !t.info.isStream && t.encoded);
    return playable
      .map((t, rank) => ({ c: toCandidate(t, simpleScore(track.durationMs, t, rank)), rank }))
      .sort((a, b) => b.c.score - a.c.score || a.rank - b.rank)
      .slice(0, Math.max(0, opts.limit))
      .map((x) => x.c);
  }

  async fromRef(ref: string): Promise<PlayableCandidate | null> {
    const id = ref.trim();
    if (!/^[\w-]{6,20}$/.test(id)) return null;
    const [t] = tracksOf(await this.loader.load(`https://www.youtube.com/watch?v=${id}`));
    return t ? toCandidate(t, 1) : null;
  }
}
