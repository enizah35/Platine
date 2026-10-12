import { beforeEach, describe, expect, it } from 'vitest';
import type { QueueRepository } from '../../src/domain/contracts/repositories.js';
import type { Track } from '../../src/domain/contracts/track.js';
import { type ContractFactory, type ContractFixture, queueItem, uniqueTrack } from './helpers.js';

export function describeQueueRepositoryContract(
  name: string,
  factory: ContractFactory<QueueRepository>,
): void {
  describe(`QueueRepository (${name})`, () => {
    let f: ContractFixture<QueueRepository>;
    let t1: Track;
    let t2: Track;
    beforeEach(async () => {
      f = await factory();
      t1 = await f.tracks.upsert(uniqueTrack({ album: 'A', isrc: 'FRZ000000001' }));
      t2 = await f.tracks.upsert(uniqueTrack());
    });

    it('rend une file vide pour un serveur inconnu', async () => {
      expect(await f.repo.load('g1')).toEqual([]);
    });

    it('relit les éléments dans l’ordre, morceaux complets compris', async () => {
      const items = [
        queueItem(t2, { origin: 'autoplay', requestedBy: null }),
        queueItem(t1),
        queueItem(t2, { origin: 'playlist', addedAt: new Date('2026-03-01T10:05:00Z') }),
      ];
      await f.repo.replace('g1', items);
      expect(await f.repo.load('g1')).toEqual(items);
    });

    it('remplace toute la file et isole les serveurs', async () => {
      const a = queueItem(t1);
      const b = queueItem(t2);
      await f.repo.replace('g1', [a, b]);
      await f.repo.replace('g2', [queueItem(t1)]);
      const c = queueItem(t1);
      await f.repo.replace('g1', [b, c]);
      expect((await f.repo.load('g1')).map((i) => i.id)).toEqual([b.id, c.id]);
      expect(await f.repo.load('g2')).toHaveLength(1);
      await f.repo.replace('g1', []);
      expect(await f.repo.load('g1')).toEqual([]);
      expect(await f.repo.load('g2')).toHaveLength(1);
    });

    it('accepte de réécrire les mêmes éléments réordonnés', async () => {
      const a = queueItem(t1);
      const b = queueItem(t2);
      await f.repo.replace('g1', [a, b]);
      await f.repo.replace('g1', [b, a]);
      expect((await f.repo.load('g1')).map((i) => i.id)).toEqual([b.id, a.id]);
    });
  });
}
