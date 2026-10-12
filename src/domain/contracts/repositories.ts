// Contrat figé (plan §5.4). Implémenté en Drizzle (adapters/db) ET en mémoire (adapters/fakes).
// Toute modification passe par le Chef et une ADR.
import type { PlayerStatus } from './events.js';
import type { GuildSettings } from './settings.js';
import type {
  CatalogTrack,
  EndReason,
  GuildId,
  LoopMode,
  QueueItem,
  QueueOrigin,
  Track,
  TrackId,
  UserId,
} from './track.js';

/** Dédoublonne par ISRC, puis identifiant externe, puis (artiste, titre normalisés, durée ±3 s). */
export interface TrackRepository {
  upsert(t: CatalogTrack): Promise<Track>;
  get(id: TrackId): Promise<Track | null>;
}

/** File persistante d'un serveur. `load` rend les éléments dans l'ordre ; `replace` réécrit toute la file. */
export interface QueueRepository {
  load(g: GuildId): Promise<QueueItem[]>;
  replace(g: GuildId, items: QueueItem[]): Promise<void>;
}

/** Colonnes de `player_state` (§4). */
export interface PlayerSnapshot {
  guildId: GuildId;
  voiceChannelId: string;
  textChannelId: string;
  panelMessageId: string | null;
  currentQueueItemId: string | null;
  currentTrackId: TrackId | null;
  positionMs: number;
  positionAt: Date;
  paused: boolean;
  loopMode: LoopMode;
  autoplay: boolean;
  status: PlayerStatus;
  updatedAt: Date;
}

/** `listActive` rend les instantanés au statut `playing`, `paused` ou `recovering` (§5.6). */
export interface PlayerStateRepository {
  load(g: GuildId): Promise<PlayerSnapshot | null>;
  save(s: PlayerSnapshot): Promise<void>;
  listActive(): Promise<PlayerSnapshot[]>;
}

export type MatchStatus = 'ok' | 'bad' | 'unplayable';

/** Colonnes de `playback_matches` (§4), hors `id` technique. Seul endroit avec une référence de source audio. */
export interface StoredMatch {
  trackId: TrackId;
  guildId: GuildId | null; // non nul = correction propre au serveur
  source: string;
  sourceRef: string;
  score: number;
  status: MatchStatus;
  reportedBy: UserId | null;
  checkedAt: Date;
}

/**
 * - `best` : meilleur match `ok` (correction du serveur d'abord, puis global ; puis score, puis fraîcheur),
 *   en excluant les références marquées `bad` pour ce serveur.
 * - `record` : insère ou remplace le match de clé (trackId, guildId, source, sourceRef).
 * - `markBad` : enregistre pour le serveur que `ref` est un mauvais titre pour `trackId`.
 */
export interface MatchRepository {
  best(trackId: TrackId, g: GuildId): Promise<StoredMatch | null>;
  record(m: StoredMatch): Promise<void>;
  markBad(trackId: TrackId, ref: string, g: GuildId, by: UserId): Promise<void>;
}

/** Colonnes de `playlists` (§4). */
export interface Playlist {
  id: string;
  guildId: GuildId;
  name: string;
  createdBy: UserId;
  createdAt: Date;
  updatedAt: Date;
}

/** Colonnes de `playlist_items` (§4), avec le morceau chargé. */
export interface PlaylistItem {
  id: string;
  playlistId: string;
  track: Track;
  position: number;
  addedBy: UserId;
  addedAt: Date;
}

/**
 * Playlists de serveur. Noms uniques par serveur sans tenir compte de la casse.
 * Erreurs : `DomainError('PLAYLIST_EXISTS')` (nom pris), `DomainError('PLAYLIST_NOT_FOUND')` (id inconnu).
 * Les droits (`playlist_edit_policy`) sont vérifiés par `policy/`, pas ici.
 */
export interface PlaylistRepository {
  create(g: GuildId, name: string, by: UserId): Promise<Playlist>;
  rename(playlistId: string, name: string): Promise<Playlist>;
  /** Supprime la playlist et ses éléments. */
  delete(playlistId: string): Promise<void>;
  /** Ajoute en fin de playlist. `NOT_FOUND` si le morceau n'est pas enregistré. */
  addItem(playlistId: string, trackId: TrackId, by: UserId): Promise<PlaylistItem>;
  /** `NOT_FOUND` si l'élément n'appartient pas à la playlist. */
  removeItem(playlistId: string, itemId: string): Promise<void>;
  /** Playlists du serveur, triées par nom. */
  list(g: GuildId): Promise<Playlist[]>;
  /** Éléments dans l'ordre de `position`. `PLAYLIST_NOT_FOUND` si la playlist n'existe pas. */
  items(playlistId: string): Promise<PlaylistItem[]>;
}

/** Paramètres de `HistoryRepository.start` (colonnes de `play_history` connues au début de la lecture). */
export interface HistoryStart {
  guildId: GuildId;
  trackId: TrackId;
  requestedBy: UserId | null; // null pour l'autoplay
  origin: QueueOrigin;
  startedAt: Date;
}

/** Paramètres de `HistoryRepository.end` (colonnes de `play_history` connues à la fin). */
export interface HistoryEnd {
  endedAt: Date;
  playedMs: number;
  endReason: EndReason;
  wrongMatch?: boolean; // défaut : false
}

export interface HistoryRepository {
  /** Rend l'identifiant de la ligne créée. */
  start(e: HistoryStart): Promise<number>;
  /** Sans effet si la ligne n'existe plus (purgée ou effacée). */
  end(id: number, e: HistoryEnd): Promise<void>;
  /** `n` derniers morceaux lancés dans le serveur, du plus récent au plus ancien (doublons possibles). */
  recent(g: GuildId, n: number): Promise<TrackId[]>;
  /** Supprime les lignes lancées avant `d`, tous serveurs confondus ; rend le nombre supprimé. */
  purgeOlderThan(d: Date): Promise<number>;
  clear(g: GuildId): Promise<void>;
}

/** `get` rend les défauts (`defaultGuildSettings`) pour un serveur jamais configuré, sans écrire. */
export interface SettingsRepository {
  get(g: GuildId): Promise<GuildSettings>;
  /** Fusionne `p` (hors `guildId`, `updatedAt`) dans les réglages courants et met `updatedAt` à jour. */
  update(g: GuildId, p: Partial<GuildSettings>): Promise<GuildSettings>;
}
