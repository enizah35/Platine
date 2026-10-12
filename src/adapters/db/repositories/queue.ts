import { asc, eq } from 'drizzle-orm';
import type { QueueRepository } from '../../../domain/contracts/repositories.js';
import type { GuildId, QueueItem } from '../../../domain/contracts/track.js';
import { queueItems } from '../schema.js';
import type { Db } from '../types.js';
import { loadTracks, requireTrack } from './shared.js';

export class DrizzleQueueRepository implements QueueRepository {
  constructor(private readonly db: Db) {}

  async load(g: GuildId): Promise<QueueItem[]> {
    const rows = await this.db
      .select()
      .from(queueItems)
      .where(eq(queueItems.guildId, g))
      .orderBy(asc(queueItems.position));
    const byId = await loadTracks(
      this.db,
      rows.map((r) => r.trackId),
    );
    return rows.map((r) => ({
      id: r.id,
      track: requireTrack(byId, r.trackId),
      requestedBy: r.requestedBy,
      origin: r.origin,
      addedAt: r.addedAt,
    }));
  }

  async replace(g: GuildId, items: QueueItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(queueItems).where(eq(queueItems.guildId, g));
      if (items.length === 0) return;
      await tx.insert(queueItems).values(
        items.map((it, position) => ({
          id: it.id,
          guildId: g,
          trackId: it.track.id,
          position,
          requestedBy: it.requestedBy,
          origin: it.origin,
          addedAt: it.addedAt,
        })),
      );
    });
  }
}
