import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchRepository, StoredMatch } from '../../src/domain/contracts/repositories.js';
import type { Track } from '../../src/domain/contracts/track.js';
import { type ContractFactory, type ContractFixture, uniqueTrack } from './helpers.js';

export function describeMatchRepositoryContract(
  name: string,
  factory: ContractFactory<MatchRepository>,
): void {
  describe(`MatchRepository (${name})`, () => {
    let f: ContractFixture<MatchRepository>;
    let track: Track;
    let m: (over?: Partial<StoredMatch>) => StoredMatch;
    beforeEach(async () => {
      f = await factory();
      track = await f.tracks.upsert(uniqueTrack());
      m = (over = {}) => ({
        trackId: track.id,
        guildId: null,
        source: 'youtube',
        sourceRef: 'yt-a',
        score: 0.8,
        status: 'ok',
        reportedBy: null,
        checkedAt: new Date('2026-03-01T10:00:00Z'),
        ...over,
      });
    });

    it('rend null sans match', async () => {
      expect(await f.repo.best(track.id, 'g1')).toBeNull();
    });

    it('rend le match global enregistré', async () => {
      await f.repo.record(m());
      expect(await f.repo.best(track.id, 'g1')).toEqual(m());
    });

    it('préfère la correction du serveur, ignore celle des autres serveurs', async () => {
      await f.repo.record(m({ sourceRef: 'yt-global', score: 0.99 }));
      await f.repo.record(m({ sourceRef: 'yt-g1', guildId: 'g1', score: 0.5, reportedBy: 'u1' }));
      expect((await f.repo.best(track.id, 'g1'))?.sourceRef).toBe('yt-g1');
      expect((await f.repo.best(track.id, 'g2'))?.sourceRef).toBe('yt-global');
    });

    it('départage par score puis par fraîcheur ; ignore les statuts autres que ok', async () => {
      await f.repo.record(m({ sourceRef: 'low', score: 0.4 }));
      await f.repo.record(m({ sourceRef: 'old', score: 0.9, checkedAt: new Date('2026-01-01T00:00:00Z') }));
      await f.repo.record(m({ sourceRef: 'new', score: 0.9, checkedAt: new Date('2026-02-01T00:00:00Z') }));
      await f.repo.record(m({ sourceRef: 'dead', score: 1, status: 'unplayable' }));
      expect((await f.repo.best(track.id, 'g1'))?.sourceRef).toBe('new');
    });

    it('record remplace le match de même clé', async () => {
      await f.repo.record(m());
      await f.repo.record(
        m({ status: 'unplayable', score: 0.1, checkedAt: new Date('2026-03-02T00:00:00Z') }),
      );
      expect(await f.repo.best(track.id, 'g1')).toBeNull();
      await f.repo.record(m({ score: 0.7 }));
      expect((await f.repo.best(track.id, 'g1'))?.score).toBe(0.7);
    });

    it('markBad exclut la référence pour ce serveur seulement', async () => {
      await f.repo.record(m({ sourceRef: 'yt-a', score: 0.9 }));
      await f.repo.record(m({ sourceRef: 'yt-b', score: 0.6 }));
      await f.repo.markBad(track.id, 'yt-a', 'g1', 'u1');
      expect((await f.repo.best(track.id, 'g1'))?.sourceRef).toBe('yt-b');
      expect((await f.repo.best(track.id, 'g2'))?.sourceRef).toBe('yt-a');
    });

    it('markBad écrase la correction du serveur sur la même référence', async () => {
      await f.repo.record(m({ sourceRef: 'yt-g1', guildId: 'g1', score: 0.5 }));
      await f.repo.markBad(track.id, 'yt-g1', 'g1', 'u2');
      expect(await f.repo.best(track.id, 'g1')).toBeNull();
    });

    it('markBad accepte une référence jamais vue', async () => {
      await f.repo.markBad(track.id, 'inconnue', 'g1', 'u1');
      await f.repo.record(m({ sourceRef: 'inconnue' }));
      expect(await f.repo.best(track.id, 'g1')).toBeNull();
      expect((await f.repo.best(track.id, 'g2'))?.sourceRef).toBe('inconnue');
    });
  });
}
