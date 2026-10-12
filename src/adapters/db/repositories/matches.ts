import { and, eq, isNull, or } from 'drizzle-orm';
import type { Clock } from '../../../domain/contracts/ports.js';
import type { MatchRepository, StoredMatch } from '../../../domain/contracts/repositories.js';
import type { GuildId, TrackId, UserId } from '../../../domain/contracts/track.js';
import { pickBestMatch, UNKNOWN_MATCH_SOURCE } from '../../../domain/repository-rules.js';
import { systemClock } from '../../system-clock.js';
import { playbackMatches } from '../schema.js';
import type { Db } from '../types.js';

export class DrizzleMatchRepository implements MatchRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = systemClock,
  ) {}

  async best(trackId: TrackId, g: GuildId): Promise<StoredMatch | null> {
    const rows = await this.db
      .select()
      .from(playbackMatches)
      .where(
        and(
          eq(playbackMatches.trackId, trackId),
          or(eq(playbackMatches.guildId, g), isNull(playbackMatches.guildId)),
        ),
      );
    return pickBestMatch(
      rows.map(({ id: _id, ...m }) => m),
      g,
    );
  }

  async record(m: StoredMatch): Promise<void> {
    await this.db
      .insert(playbackMatches)
      .values(m)
      .onConflictDoUpdate({
        target: [
          playbackMatches.trackId,
          playbackMatches.guildId,
          playbackMatches.source,
          playbackMatches.sourceRef,
        ],
        set: { score: m.score, status: m.status, reportedBy: m.reportedBy, checkedAt: m.checkedAt },
      });
  }

  async markBad(trackId: TrackId, ref: string, g: GuildId, by: UserId): Promise<void> {
    const [known] = await this.db
      .select({ source: playbackMatches.source })
      .from(playbackMatches)
      .where(and(eq(playbackMatches.trackId, trackId), eq(playbackMatches.sourceRef, ref)))
      .limit(1);
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
