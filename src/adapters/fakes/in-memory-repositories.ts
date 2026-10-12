// Dépôts en mémoire : même comportement que les dépôts Drizzle (vérifié par tests/contract).
// Ils rendent toujours des copies : modifier un objet rendu ne modifie pas le dépôt.
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/contracts/errors.js';
import type { Clock } from '../../domain/contracts/ports.js';
import type {
  HistoryEnd,
  HistoryRepository,
  HistoryStart,
  MatchRepository,
  PlayerSnapshot,
  PlayerStateRepository,
  Playlist,
  PlaylistItem,
  PlaylistRepository,
  QueueRepository,
  SettingsRepository,
  StoredMatch,
  TrackRepository,
} from '../../domain/contracts/repositories.js';
import { defaultGuildSettings, type GuildSettings } from '../../domain/contracts/settings.js';
import type {
  CatalogTrack,
  GuildId,
  QueueItem,
  Track,
  TrackId,
  UserId,
} from '../../domain/contracts/track.js';
import {
  ACTIVE_PLAYER_STATUSES,
  mergeSettings,
  pickBestMatch,
  UNKNOWN_MATCH_SOURCE,
} from '../../domain/repository-rules.js';
import { isSameTrackFuzzy, mergeTrack, normalizeIsrc } from '../../domain/tracks/identity.js';
import type { RepositoryBundle } from '../repository-bundle.js';
import { systemClock } from '../system-clock.js';

const clone = <T>(v: T): T => structuredClone(v);
const extKey = (provider: string, id: string) => `${provider}\u0000${id}`;

export class InMemoryTrackRepository implements TrackRepository {
  private readonly byId = new Map<TrackId, Track>();
  /** (fournisseur, id externe) → morceau : un identifiant externe n'appartient qu'à un morceau. */
  private readonly byExternal = new Map<string, TrackId>();

  async get(id: TrackId): Promise<Track | null> {
    const t = this.byId.get(id);
    return t ? clone(t) : null;
  }

  /** Accès synchrone pour les autres dépôts en mémoire (jointure). */
  peek(id: TrackId): Track | undefined {
    const t = this.byId.get(id);
    return t ? clone(t) : undefined;
  }

  async upsert(t: CatalogTrack): Promise<Track> {
    const existing = this.findExisting(t);
    let stored: Track;
    if (existing) {
      stored = mergeTrack(existing, t);
    } else {
      const isrc = normalizeIsrc(t.isrc);
      stored = {
        id: randomUUID(),
        title: t.title,
        artists: [...t.artists],
        durationMs: t.durationMs,
        genres: [...t.genres],
        explicit: t.explicit,
        externalIds: [],
        ...(t.album !== undefined ? { album: t.album } : {}),
        ...(isrc !== null ? { isrc } : {}),
        ...(t.artworkUrl !== undefined ? { artworkUrl: t.artworkUrl } : {}),
      };
      stored = mergeTrack(stored, { ...t, isrc: undefined });
    }
    // Un identifiant externe déjà rattaché à un autre morceau reste à cet autre morceau (comme ON CONFLICT DO NOTHING).
    stored.externalIds = stored.externalIds
      .filter((x) => {
        const owner = this.byExternal.get(extKey(x.provider, x.id));
        return owner === undefined || owner === stored.id;
      })
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
    for (const x of stored.externalIds) this.byExternal.set(extKey(x.provider, x.id), stored.id);
    this.byId.set(stored.id, stored);
    return clone(stored);
  }

  private findExisting(t: CatalogTrack): Track | undefined {
    const isrc = normalizeIsrc(t.isrc);
    const all = [...this.byId.values()];
    if (isrc) {
      const hit = all.find((x) => x.isrc === isrc);
      if (hit) return hit;
    }
    for (const x of t.externalIds) {
      const id = this.byExternal.get(extKey(x.provider, x.id));
      if (id) return this.byId.get(id);
    }
    return all.find((c) => !(isrc && c.isrc && c.isrc !== isrc) && isSameTrackFuzzy(c, t));
  }
}

export class InMemoryQueueRepository implements QueueRepository {
  private readonly queues = new Map<GuildId, QueueItem[]>();

  async load(g: GuildId): Promise<QueueItem[]> {
    return clone(this.queues.get(g) ?? []);
  }

  async replace(g: GuildId, items: QueueItem[]): Promise<void> {
    if (items.length === 0) this.queues.delete(g);
    else this.queues.set(g, clone(items));
  }
}

export class InMemoryPlayerStateRepository implements PlayerStateRepository {
  private readonly snapshots = new Map<GuildId, PlayerSnapshot>();

  async load(g: GuildId): Promise<PlayerSnapshot | null> {
    const s = this.snapshots.get(g);
    return s ? clone(s) : null;
  }

  async save(s: PlayerSnapshot): Promise<void> {
    this.snapshots.set(s.guildId, clone(s));
  }

  async listActive(): Promise<PlayerSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((s) => ACTIVE_PLAYER_STATUSES.includes(s.status))
      .sort((a, b) => (a.guildId < b.guildId ? -1 : a.guildId > b.guildId ? 1 : 0))
      .map(clone);
  }
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly rows = new Map<string, StoredMatch>();

  constructor(private readonly clock: Clock = systemClock) {}

  async best(trackId: TrackId, g: GuildId): Promise<StoredMatch | null> {
    const rows = [...this.rows.values()].filter((r) => r.trackId === trackId);
    const best = pickBestMatch(rows, g);
    return best ? clone(best) : null;
  }

  async record(m: StoredMatch): Promise<void> {
    this.rows.set(JSON.stringify([m.trackId, m.guildId, m.source, m.sourceRef]), clone(m));
  }

  async markBad(trackId: TrackId, ref: string, g: GuildId, by: UserId): Promise<void> {
    const known = [...this.rows.values()].find((r) => r.trackId === trackId && r.sourceRef === ref);
    await this.record({
      trackId,
      guildId: g,
      source: known?.source ?? UNKNOWN_MATCH_SOURCE,
      sourceRef: ref,
      score: 0,
      status: 'bad',
      reportedBy: by,
      checkedAt: this.clock.now(),
    });
  }
}

interface StoredPlaylistItem {
  id: string;
  playlistId: string;
  trackId: TrackId;
  position: number;
  addedBy: UserId;
  addedAt: Date;
}

export class InMemoryPlaylistRepository implements PlaylistRepository {
  private readonly playlists = new Map<string, Playlist>();
  private readonly itemsById = new Map<string, StoredPlaylistItem>();

  constructor(
    private readonly tracks: InMemoryTrackRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async create(g: GuildId, name: string, by: UserId): Promise<Playlist> {
    this.assertNameFree(g, name, null);
    const now = this.clock.now();
    const p: Playlist = { id: randomUUID(), guildId: g, name, createdBy: by, createdAt: now, updatedAt: now };
    this.playlists.set(p.id, p);
    return clone(p);
  }

  async rename(playlistId: string, name: string): Promise<Playlist> {
    const p = this.require(playlistId);
    this.assertNameFree(p.guildId, name, p.id);
    p.name = name;
    p.updatedAt = this.clock.now();
    return clone(p);
  }

  async delete(playlistId: string): Promise<void> {
    this.require(playlistId);
    this.playlists.delete(playlistId);
    for (const [id, it] of this.itemsById) if (it.playlistId === playlistId) this.itemsById.delete(id);
  }

  async addItem(playlistId: string, trackId: TrackId, by: UserId): Promise<PlaylistItem> {
    const p = this.require(playlistId);
    const track = this.tracks.peek(trackId);
    if (!track) throw new DomainError('NOT_FOUND', `Morceau ${trackId} inconnu`);
    const last = Math.max(-1, ...this.storedItems(playlistId).map((i) => i.position));
    const now = this.clock.now();
    const it: StoredPlaylistItem = {
      id: randomUUID(),
      playlistId,
      trackId,
      position: last + 1,
      addedBy: by,
      addedAt: now,
    };
    this.itemsById.set(it.id, it);
    p.updatedAt = now;
    return this.toItem(it);
  }

  async removeItem(playlistId: string, itemId: string): Promise<void> {
    const p = this.require(playlistId);
    const it = this.itemsById.get(itemId);
    if (!it || it.playlistId !== playlistId)
      throw new DomainError('NOT_FOUND', `Élément ${itemId} absent de la playlist`);
    this.itemsById.delete(itemId);
    p.updatedAt = this.clock.now();
  }

  async list(g: GuildId): Promise<Playlist[]> {
    return [...this.playlists.values()]
      .filter((p) => p.guildId === g)
      .sort(
        (a, b) =>
          cmp(a.name.toLowerCase(), b.name.toLowerCase()) || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map(clone);
  }

  async items(playlistId: string): Promise<PlaylistItem[]> {
    this.require(playlistId);
    return this.storedItems(playlistId).map((it) => this.toItem(it));
  }

  private storedItems(playlistId: string): StoredPlaylistItem[] {
    return [...this.itemsById.values()]
      .filter((i) => i.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  private toItem(it: StoredPlaylistItem): PlaylistItem {
    const track = this.tracks.peek(it.trackId);
    if (!track) throw new Error(`Morceau ${it.trackId} introuvable (intégrité)`);
    return {
      id: it.id,
      playlistId: it.playlistId,
      track,
      position: it.position,
      addedBy: it.addedBy,
      addedAt: new Date(it.addedAt),
    };
  }

  private require(playlistId: string): Playlist {
    const p = this.playlists.get(playlistId);
    if (!p) throw new DomainError('PLAYLIST_NOT_FOUND');
    return p;
  }

  private assertNameFree(g: GuildId, name: string, exceptId: string | null): void {
    const lower = name.toLowerCase();
    for (const p of this.playlists.values()) {
      if (p.guildId === g && p.id !== exceptId && p.name.toLowerCase() === lower) {
        throw new DomainError('PLAYLIST_EXISTS', `Playlist « ${name} » déjà existante`);
      }
    }
  }
}

interface StoredHistory extends HistoryStart {
  id: number;
  endedAt: Date | null;
  playedMs: number | null;
  endReason: HistoryEnd['endReason'] | null;
  wrongMatch: boolean;
}

export class InMemoryHistoryRepository implements HistoryRepository {
  private readonly rows = new Map<number, StoredHistory>();
  private nextId = 1;

  async start(e: HistoryStart): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, { ...clone(e), id, endedAt: null, playedMs: null, endReason: null, wrongMatch: false });
    return id;
  }

  async end(id: number, e: HistoryEnd): Promise<void> {
    const r = this.rows.get(id);
    if (!r) return;
    r.endedAt = new Date(e.endedAt);
    r.playedMs = e.playedMs;
    r.endReason = e.endReason;
    r.wrongMatch = e.wrongMatch ?? false;
  }

  async recent(g: GuildId, n: number): Promise<TrackId[]> {
    if (n <= 0) return [];
    return [...this.rows.values()]
      .filter((r) => r.guildId === g)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id)
      .slice(0, n)
      .map((r) => r.trackId);
  }

  async purgeOlderThan(d: Date): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) {
      if (r.startedAt.getTime() < d.getTime()) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }

  async clear(g: GuildId): Promise<void> {
    for (const [id, r] of this.rows) if (r.guildId === g) this.rows.delete(id);
  }

  /** Lecture brute pour les tests (fin de lecture, wrong_match…). */
  peek(id: number): Readonly<StoredHistory> | undefined {
    const r = this.rows.get(id);
    return r ? clone(r) : undefined;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly rows = new Map<GuildId, GuildSettings>();

  constructor(private readonly clock: Clock = systemClock) {}

  async get(g: GuildId): Promise<GuildSettings> {
    return clone(this.rows.get(g) ?? defaultGuildSettings(g));
  }

  async update(g: GuildId, p: Partial<GuildSettings>): Promise<GuildSettings> {
    const next = mergeSettings(this.rows.get(g) ?? defaultGuildSettings(g), p, this.clock.now());
    this.rows.set(g, next);
    return clone(next);
  }
}

export interface InMemoryRepositoryBundle extends RepositoryBundle {
  tracks: InMemoryTrackRepository;
  queue: InMemoryQueueRepository;
  playerState: InMemoryPlayerStateRepository;
  matches: InMemoryMatchRepository;
  playlists: InMemoryPlaylistRepository;
  history: InMemoryHistoryRepository;
  settings: InMemorySettingsRepository;
}

export function createInMemoryRepositories(clock: Clock = systemClock): InMemoryRepositoryBundle {
  const tracks = new InMemoryTrackRepository();
  return {
    tracks,
    queue: new InMemoryQueueRepository(),
    playerState: new InMemoryPlayerStateRepository(),
    matches: new InMemoryMatchRepository(clock),
    playlists: new InMemoryPlaylistRepository(tracks, clock),
    history: new InMemoryHistoryRepository(),
    settings: new InMemorySettingsRepository(clock),
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
