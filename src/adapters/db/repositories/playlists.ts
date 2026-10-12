import { and, asc, eq, max, sql } from 'drizzle-orm';
import { DomainError } from '../../../domain/contracts/errors.js';
import type { Clock } from '../../../domain/contracts/ports.js';
import type { Playlist, PlaylistItem, PlaylistRepository } from '../../../domain/contracts/repositories.js';
import type { GuildId, TrackId, UserId } from '../../../domain/contracts/track.js';
import { systemClock } from '../../system-clock.js';
import { playlistItems, playlists, tracks } from '../schema.js';
import type { Db } from '../types.js';
import { isUniqueViolation, isUuid, loadTracks, requireTrack } from './shared.js';

export class DrizzlePlaylistRepository implements PlaylistRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = systemClock,
  ) {}

  async create(g: GuildId, name: string, by: UserId): Promise<Playlist> {
    const now = this.clock.now();
    try {
      const [row] = await this.db
        .insert(playlists)
        .values({ guildId: g, name, createdBy: by, createdAt: now, updatedAt: now })
        .returning();
      if (!row) throw new Error('Insertion de playlist sans retour');
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new DomainError('PLAYLIST_EXISTS', `Playlist « ${name} » déjà existante`, { cause: e });
      throw e;
    }
  }

  async rename(playlistId: string, name: string): Promise<Playlist> {
    if (!isUuid(playlistId)) throw new DomainError('PLAYLIST_NOT_FOUND');
    try {
      const [row] = await this.db
        .update(playlists)
        .set({ name, updatedAt: this.clock.now() })
        .where(eq(playlists.id, playlistId))
        .returning();
      if (!row) throw new DomainError('PLAYLIST_NOT_FOUND');
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new DomainError('PLAYLIST_EXISTS', `Playlist « ${name} » déjà existante`, { cause: e });
      throw e;
    }
  }

  async delete(playlistId: string): Promise<void> {
    if (!isUuid(playlistId)) throw new DomainError('PLAYLIST_NOT_FOUND');
    const rows = await this.db
      .delete(playlists)
      .where(eq(playlists.id, playlistId))
      .returning({ id: playlists.id });
    if (rows.length === 0) throw new DomainError('PLAYLIST_NOT_FOUND');
  }

  addItem(playlistId: string, trackId: TrackId, by: UserId): Promise<PlaylistItem> {
    return this.db.transaction(async (tx) => {
      // Verrou sur la playlist : deux ajouts simultanés ne prennent pas la même position.
      const [pl] = isUuid(playlistId)
        ? await tx
            .select({ id: playlists.id })
            .from(playlists)
            .where(eq(playlists.id, playlistId))
            .for('update')
        : [];
      if (!pl) throw new DomainError('PLAYLIST_NOT_FOUND');
      const [tr] = isUuid(trackId)
        ? await tx.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, trackId))
        : [];
      if (!tr) throw new DomainError('NOT_FOUND', `Morceau ${trackId} inconnu`);
      const [agg] = await tx
        .select({ last: max(playlistItems.position) })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, playlistId));
      const now = this.clock.now();
      const [row] = await tx
        .insert(playlistItems)
        .values({ playlistId, trackId, position: (agg?.last ?? -1) + 1, addedBy: by, addedAt: now })
        .returning();
      if (!row) throw new Error("Insertion d'élément sans retour");
      await tx.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId));
      const byId = await loadTracks(tx, [trackId]);
      return {
        id: row.id,
        playlistId,
        track: requireTrack(byId, trackId),
        position: row.position,
        addedBy: row.addedBy,
        addedAt: row.addedAt,
      };
    });
  }

  removeItem(playlistId: string, itemId: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      await this.requirePlaylist(tx, playlistId);
      if (!isUuid(itemId)) throw new DomainError('NOT_FOUND', `Élément ${itemId} absent de la playlist`);
      const rows = await tx
        .delete(playlistItems)
        .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
        .returning({ id: playlistItems.id });
      if (rows.length === 0) throw new DomainError('NOT_FOUND', `Élément ${itemId} absent de la playlist`);
      await tx.update(playlists).set({ updatedAt: this.clock.now() }).where(eq(playlists.id, playlistId));
    });
  }

  list(g: GuildId): Promise<Playlist[]> {
    return this.db
      .select()
      .from(playlists)
      .where(eq(playlists.guildId, g))
      .orderBy(sql`lower(${playlists.name})`, asc(playlists.createdAt));
  }

  async items(playlistId: string): Promise<PlaylistItem[]> {
    await this.requirePlaylist(this.db, playlistId);
    const rows = await this.db
      .select()
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, playlistId))
      .orderBy(asc(playlistItems.position));
    const byId = await loadTracks(
      this.db,
      rows.map((r) => r.trackId),
    );
    return rows.map((r) => ({
      id: r.id,
      playlistId: r.playlistId,
      track: requireTrack(byId, r.trackId),
      position: r.position,
      addedBy: r.addedBy,
      addedAt: r.addedAt,
    }));
  }

  private async requirePlaylist(db: Db, playlistId: string): Promise<void> {
    if (!isUuid(playlistId)) throw new DomainError('PLAYLIST_NOT_FOUND');
    const [pl] = await db.select({ id: playlists.id }).from(playlists).where(eq(playlists.id, playlistId));
    if (!pl) throw new DomainError('PLAYLIST_NOT_FOUND');
  }
}
