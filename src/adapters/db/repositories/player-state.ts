import { asc, eq, inArray } from 'drizzle-orm';
import type { PlayerSnapshot, PlayerStateRepository } from '../../../domain/contracts/repositories.js';
import type { GuildId } from '../../../domain/contracts/track.js';
import { ACTIVE_PLAYER_STATUSES } from '../../../domain/repository-rules.js';
import { playerState } from '../schema.js';
import type { Db } from '../types.js';

export class DrizzlePlayerStateRepository implements PlayerStateRepository {
  constructor(private readonly db: Db) {}

  async load(g: GuildId): Promise<PlayerSnapshot | null> {
    const [row] = await this.db.select().from(playerState).where(eq(playerState.guildId, g)).limit(1);
    return row ?? null;
  }

  async save(s: PlayerSnapshot): Promise<void> {
    const { guildId, ...rest } = s;
    await this.db
      .insert(playerState)
      .values({ guildId, ...rest })
      .onConflictDoUpdate({ target: playerState.guildId, set: rest });
  }

  listActive(): Promise<PlayerSnapshot[]> {
    return this.db
      .select()
      .from(playerState)
      .where(inArray(playerState.status, [...ACTIVE_PLAYER_STATUSES]))
      .orderBy(asc(playerState.guildId));
  }
}
