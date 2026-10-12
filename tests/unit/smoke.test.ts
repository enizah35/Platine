import { describe, expect, it } from 'vitest';
import { BOT_NAME, defaultGuildSettings as fromConfig } from '../../src/config/defaults.js';
import {
  DomainError,
  defaultGuildSettings,
  GUILD_SETTINGS_DEFAULTS,
  isDomainError,
} from '../../src/domain/index.js';

describe('socle', () => {
  it('expose les défauts produit depuis un seul endroit', () => {
    expect(fromConfig).toBe(defaultGuildSettings);
    expect(BOT_NAME).toBe('Platine');
    expect(defaultGuildSettings('g1')).toEqual({
      guildId: 'g1',
      locale: 'fr',
      controlPolicy: 'everyone',
      djRoleId: null,
      autoplayDefault: true,
      idleTimeoutS: 300,
      keepQueueOnLeave: true,
      playlistEditPolicy: 'everyone_adds_owner_or_admin_removes',
      historyRetentionDays: 365,
      updatedAt: new Date(0),
    });
    expect(Object.isFrozen(GUILD_SETTINGS_DEFAULTS)).toBe(true);
  });

  it('DomainError porte un code', () => {
    const e = new DomainError('QUEUE_EMPTY');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('DomainError');
    expect(e.message).toBe('QUEUE_EMPTY');
    expect(isDomainError(e)).toBe(true);
    expect(isDomainError(e, 'QUEUE_EMPTY')).toBe(true);
    expect(isDomainError(e, 'FORBIDDEN')).toBe(false);
    expect(isDomainError(new Error('x'))).toBe(false);
  });
});
