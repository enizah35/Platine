import { beforeEach, describe, expect, it } from 'vitest';
import type { SettingsRepository } from '../../src/domain/contracts/repositories.js';
import { defaultGuildSettings } from '../../src/domain/contracts/settings.js';
import type { ContractFactory, ContractFixture } from './helpers.js';

export function describeSettingsRepositoryContract(
  name: string,
  factory: ContractFactory<SettingsRepository>,
): void {
  describe(`SettingsRepository (${name})`, () => {
    let f: ContractFixture<SettingsRepository>;
    beforeEach(async () => {
      f = await factory();
    });

    it('rend les défauts pour un serveur jamais configuré', async () => {
      expect(await f.repo.get('g1')).toEqual(defaultGuildSettings('g1'));
    });

    it('fusionne un patch partiel et horodate la mise à jour', async () => {
      const r = await f.repo.update('g1', { locale: 'en', idleTimeoutS: 60 });
      expect(r).toEqual({
        ...defaultGuildSettings('g1'),
        locale: 'en',
        idleTimeoutS: 60,
        updatedAt: f.clock.now(),
      });
      expect(await f.repo.get('g1')).toEqual(r);
      f.clock.advance(60_000);
      const r2 = await f.repo.update('g1', { autoplayDefault: false, djRoleId: 'role-1' });
      expect(r2).toEqual({ ...r, autoplayDefault: false, djRoleId: 'role-1', updatedAt: f.clock.now() });
      expect(await f.repo.get('g1')).toEqual(r2);
    });

    it('ignore guildId, updatedAt et les valeurs undefined du patch', async () => {
      const r = await f.repo.update('g1', {
        guildId: 'pirate',
        updatedAt: new Date('2000-01-01T00:00:00Z'),
        locale: undefined,
        historyRetentionDays: 30,
      });
      expect(r.guildId).toBe('g1');
      expect(r.updatedAt).toEqual(f.clock.now());
      expect(r.locale).toBe('fr');
      expect(r.historyRetentionDays).toBe(30);
      expect(await f.repo.get('pirate')).toEqual(defaultGuildSettings('pirate'));
    });

    it('isole les serveurs', async () => {
      await f.repo.update('g1', { playlistEditPolicy: 'everyone', controlPolicy: 'dj_role' });
      expect(await f.repo.get('g2')).toEqual(defaultGuildSettings('g2'));
    });
  });
}
