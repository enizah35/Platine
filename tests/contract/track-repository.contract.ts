import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TrackRepository } from '../../src/domain/contracts/repositories.js';
import { type ContractFactory, type ContractFixture, catalogTrack, sortExt } from './helpers.js';

export function describeTrackRepositoryContract(
  name: string,
  factory: ContractFactory<TrackRepository>,
): void {
  describe(`TrackRepository (${name})`, () => {
    let f: ContractFixture<TrackRepository>;
    beforeEach(async () => {
      f = await factory();
    });

    it('enregistre un morceau et le relit', async () => {
      const input = catalogTrack({
        album: 'Discovery',
        isrc: 'GBDUW0000059',
        artworkUrl: 'https://img/1.jpg',
      });
      const t = await f.repo.upsert(input);
      expect(t.id).toEqual(expect.any(String));
      expect(t).toEqual({ ...input, id: t.id });
      expect(await f.repo.get(t.id)).toEqual(t);
    });

    it('rend null pour un identifiant inconnu ou mal formé', async () => {
      expect(await f.repo.get(randomUUID())).toBeNull();
      expect(await f.repo.get('pas-un-uuid')).toBeNull();
    });

    it('omet les champs optionnels absents', async () => {
      const t = await f.repo.upsert(catalogTrack({ externalIds: [] }));
      expect(t).not.toHaveProperty('album');
      expect(t).not.toHaveProperty('isrc');
      expect(t).not.toHaveProperty('artworkUrl');
      expect(t.externalIds).toEqual([]);
    });

    it('dédoublonne par ISRC (insensible à la casse et aux tirets) et fusionne les identifiants externes', async () => {
      const a = await f.repo.upsert(catalogTrack({ isrc: 'GBDUW0000059' }));
      const b = await f.repo.upsert(
        catalogTrack({
          title: 'One More Time (Radio Edit)',
          isrc: 'gb-duw-00-00059',
          durationMs: 200_000,
          externalIds: [{ provider: 'spotify', id: '0DiWol3AO6WpXZgp0goxAV' }],
        }),
      );
      expect(b.id).toBe(a.id);
      expect(b.title).toBe('One More Time'); // rien n'est écrasé
      expect(sortExt(b).externalIds.map((x) => x.provider)).toEqual(['deezer', 'spotify']);
    });

    it('dédoublonne par identifiant externe en l’absence d’ISRC', async () => {
      const a = await f.repo.upsert(catalogTrack());
      const b = await f.repo.upsert(catalogTrack({ title: 'Autre titre', durationMs: 1_000 }));
      expect(b.id).toBe(a.id);
    });

    it('dédoublonne par artiste et titre normalisés à ±3 s, et complète les champs manquants', async () => {
      const a = await f.repo.upsert(catalogTrack({ externalIds: [] }));
      const b = await f.repo.upsert(
        catalogTrack({
          title: 'one more time!',
          artists: ['DAFT PUNK'],
          durationMs: 323_000,
          album: 'Discovery',
          isrc: 'GBDUW0000059',
          externalIds: [{ provider: 'spotify', id: 'sp1' }],
        }),
      );
      expect(b.id).toBe(a.id);
      expect(b.album).toBe('Discovery');
      expect(b.isrc).toBe('GBDUW0000059');
      expect(b.externalIds).toEqual([{ provider: 'spotify', id: 'sp1' }]);
      expect(await f.repo.get(a.id)).toEqual(b);
    });

    it('distingue deux morceaux hors tolérance de durée', async () => {
      const a = await f.repo.upsert(catalogTrack({ externalIds: [] }));
      const b = await f.repo.upsert(catalogTrack({ externalIds: [], durationMs: 323_001 }));
      expect(b.id).not.toBe(a.id);
    });

    it('distingue deux morceaux homonymes aux ISRC différents', async () => {
      const a = await f.repo.upsert(catalogTrack({ externalIds: [], isrc: 'AAA000000001' }));
      const b = await f.repo.upsert(catalogTrack({ externalIds: [], isrc: 'AAA000000002' }));
      expect(b.id).not.toBe(a.id);
    });

    it('rend des copies indépendantes', async () => {
      const t = await f.repo.upsert(catalogTrack());
      t.title = 'modifié';
      t.externalIds.push({ provider: 'spotify', id: 'x' });
      const again = await f.repo.get(t.id);
      expect(again?.title).toBe('One More Time');
      expect(again?.externalIds).toHaveLength(1);
    });
  });
}
