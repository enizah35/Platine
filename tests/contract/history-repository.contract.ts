import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoryRepository, HistoryStart } from '../../src/domain/contracts/repositories.js';
import type { Track } from '../../src/domain/contracts/track.js';
import { type ContractFactory, type ContractFixture, uniqueTrack } from './helpers.js';

export function describeHistoryRepositoryContract(
  name: string,
  factory: ContractFactory<HistoryRepository>,
): void {
  describe(`HistoryRepository (${name})`, () => {
    let f: ContractFixture<HistoryRepository>;
    let t: Track[];
    const at = (iso: string) => new Date(`2026-03-01T${iso}Z`);
    const start = (over: Partial<HistoryStart> & { trackId: string }): HistoryStart => ({
      guildId: 'g1',
      requestedBy: 'u1',
      origin: 'user',
      startedAt: at('10:00:00'),
      ...over,
    });
    beforeEach(async () => {
      f = await factory();
      t = [];
      for (let i = 0; i < 4; i++) t.push(await f.tracks.upsert(uniqueTrack()));
    });
    const id = (i: number) => (t[i] as Track).id;

    it('start rend des identifiants distincts et croissants ; end ne lève pas', async () => {
      const a = await f.repo.start(start({ trackId: id(0) }));
      const b = await f.repo.start(start({ trackId: id(1), requestedBy: null, origin: 'autoplay' }));
      expect(b).toBeGreaterThan(a);
      await f.repo.end(a, { endedAt: at('10:03:00'), playedMs: 180_000, endReason: 'finished' });
      await f.repo.end(b, {
        endedAt: at('10:04:00'),
        playedMs: 10_000,
        endReason: 'skipped',
        wrongMatch: true,
      });
      await expect(
        f.repo.end(999_999, { endedAt: at('10:05:00'), playedMs: 0, endReason: 'stopped' }),
      ).resolves.toBeUndefined();
    });

    it('recent rend les n derniers morceaux du serveur, du plus récent au plus ancien', async () => {
      await f.repo.start(start({ trackId: id(0), startedAt: at('10:00:00') }));
      await f.repo.start(start({ trackId: id(1), startedAt: at('10:05:00') }));
      await f.repo.start(start({ trackId: id(2), startedAt: at('10:02:00') }));
      await f.repo.start(start({ trackId: id(0), startedAt: at('10:09:00') }));
      await f.repo.start(start({ trackId: id(3), startedAt: at('10:10:00'), guildId: 'g2' }));
      expect(await f.repo.recent('g1', 10)).toEqual([id(0), id(1), id(2), id(0)]);
      expect(await f.repo.recent('g1', 2)).toEqual([id(0), id(1)]);
      expect(await f.repo.recent('g1', 0)).toEqual([]);
      expect(await f.repo.recent('g9', 5)).toEqual([]);
    });

    it('départage les lancements simultanés par ordre d’insertion', async () => {
      await f.repo.start(start({ trackId: id(0) }));
      await f.repo.start(start({ trackId: id(1) }));
      expect(await f.repo.recent('g1', 2)).toEqual([id(1), id(0)]);
    });

    it('purgeOlderThan supprime strictement avant la date, tous serveurs', async () => {
      await f.repo.start(start({ trackId: id(0), startedAt: new Date('2025-01-01T00:00:00Z') }));
      await f.repo.start(
        start({ trackId: id(1), startedAt: new Date('2025-02-01T00:00:00Z'), guildId: 'g2' }),
      );
      await f.repo.start(start({ trackId: id(2), startedAt: new Date('2025-03-01T00:00:00Z') }));
      expect(await f.repo.purgeOlderThan(new Date('2025-03-01T00:00:00Z'))).toBe(2);
      expect(await f.repo.recent('g1', 10)).toEqual([id(2)]);
      expect(await f.repo.recent('g2', 10)).toEqual([]);
      expect(await f.repo.purgeOlderThan(new Date('2025-03-01T00:00:00Z'))).toBe(0);
    });

    it('clear efface l’historique d’un seul serveur', async () => {
      await f.repo.start(start({ trackId: id(0) }));
      await f.repo.start(start({ trackId: id(1), guildId: 'g2' }));
      await f.repo.clear('g1');
      expect(await f.repo.recent('g1', 10)).toEqual([]);
      expect(await f.repo.recent('g2', 10)).toEqual([id(1)]);
    });
  });
}
