import { desc, eq, lt } from 'drizzle-orm';
import type { HistoryEnd, HistoryRepository, HistoryStart } from '../../../domain/contracts/repositories.js';
import type { GuildId, TrackId } from '../../../domain/contracts/track.js';
import { playHistory } from '../schema.js';
import type { Db } from '../types.js';

export class DrizzleHistoryRepository implements HistoryRepository {
  constructor(private readonly db: Db) {}

  async start(e: HistoryStart): Promise<number> {
    const [row] = await this.db.insert(playHistory).values(e).returning({ id: playHistory.id });
    if (!row) throw new Error("Insertion d'historique sans retour");
    return row.id;
  }

  async end(id: number, e: HistoryEnd): Promise<void> {
    await this.db
      .update(playHistory)
      .set({
        endedAt: e.endedAt,
        playedMs: e.playedMs,
        endReason: e.endReason,
        wrongMatch: e.wrongMatch ?? false,
      })
      .where(eq(playHistory.id, id));
  }

  async recent(g: GuildId, n: number): Promise<TrackId[]> {
    if (n <= 0) return [];
    const rows = await this.db
      .select({ trackId: playHistory.trackId })
      .from(playHistory)
      .where(eq(playHistory.guildId, g))
      .orderBy(desc(playHistory.startedAt), desc(playHistory.id))
      .limit(n);
    return rows.map((r) => r.trackId);
  }

  async purgeOlderThan(d: Date): Promise<number> {
    const rows = await this.db
      .delete(playHistory)
      .where(lt(playHistory.startedAt, d))
      .returning({ id: playHistory.id });
    return rows.length;
  }

  async clear(g: GuildId): Promise<void> {
    await this.db.delete(playHistory).where(eq(playHistory.guildId, g));
  }
}
