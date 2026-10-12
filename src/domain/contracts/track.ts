// Contrat figé (plan §5.1). Toute modification passe par le Chef et une ADR.
export type GuildId = string;
export type UserId = string;
export type TrackId = string;

export interface CatalogTrack {
  // identité catalogue, jamais d'URL audio
  title: string;
  artists: string[];
  album?: string;
  durationMs: number;
  isrc?: string;
  artworkUrl?: string;
  genres: string[];
  explicit: boolean;
  externalIds: { provider: 'deezer' | 'spotify' | 'musicbrainz'; id: string; url?: string }[];
}
export interface Track extends CatalogTrack {
  id: TrackId;
} // persisté

export type QueueOrigin = 'user' | 'playlist' | 'autoplay' | 'radio';
export interface QueueItem {
  id: string;
  track: Track;
  requestedBy: UserId | null;
  origin: QueueOrigin;
  addedAt: Date;
}
export type LoopMode = 'off' | 'track' | 'queue';
export type EndReason = 'finished' | 'skipped' | 'failed' | 'stopped' | 'replaced';
