import { eq } from 'drizzle-orm';
import type { Clock } from '../../../domain/contracts/ports.js';
import type { SettingsRepository } from '../../../domain/contracts/repositories.js';
import { defaultGuildSettings, type GuildSettings } from '../../../domain/contracts/settings.js';
import type { GuildId } from '../../../domain/contracts/track.js';
import { mergeSettings } from '../../../domain/repository-rules.js';
import { systemClock } from '../../system-clock.js';
import { guildSettings } from '../schema.js';
import type { Db } from '../types.js';

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(g: GuildId): Promise<GuildSettings> {
    const [row] = await this.db.select().from(guildSettings).where(eq(guildSettings.guildId, g)).limit(1);
    return row ?? defaultGuildSettings(g);
  }

  update(g: GuildId, p: Partial<GuildSettings>): Promise<GuildSettings> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(guildSettings).where(eq(guildSettings.guildId, g)).for('update');
      const next = mergeSettings(row ?? defaultGuildSettings(g), p, this.clock.now());
      const { guildId, ...rest } = next;
      await tx
        .insert(guildSettings)
        .values({ guildId, ...rest })
        .onConflictDoUpdate({ target: guildSettings.guildId, set: rest });
      return next;
    });
  }
}
