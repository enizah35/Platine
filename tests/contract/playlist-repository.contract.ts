import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlaylistRepository } from '../../src/domain/contracts/repositories.js';
import type { Track } from '../../src/domain/contracts/track.js';
import { type ContractFactory, type ContractFixture, expectDomainError, uniqueTrack } from './helpers.js';

export function describePlaylistRepositoryContract(
  name: string,
  factory: ContractFactory<PlaylistRepository>,
): void {
  describe(`PlaylistRepository (${name})`, () => {
    let f: ContractFixture<PlaylistRepository>;
    let t1: Track;
    let t2: Track;
    beforeEach(async () => {
      f = await factory();
      t1 = await f.tracks.upsert(uniqueTrack());
      t2 = await f.tracks.upsert(uniqueTrack({ album: 'Album' }));
    });

    it('crée une playlist horodatée par l’horloge', async () => {
      const p = await f.repo.create('g1', 'Soirée', 'u1');
      expect(p).toEqual({
        id: expect.any(String),
        guildId: 'g1',
        name: 'Soirée',
        createdBy: 'u1',
        createdAt: f.clock.now(),
        updatedAt: f.clock.now(),
      });
    });

    it('refuse un nom déjà pris dans le serveur, sans tenir compte de la casse', async () => {
      await f.repo.create('g1', 'Soirée', 'u1');
      await expectDomainError(f.repo.create('g1', 'SOIRÉE', 'u2'), 'PLAYLIST_EXISTS');
      await expect(f.repo.create('g2', 'Soirée', 'u2')).resolves.toBeDefined();
    });

    it('liste les playlists d’un serveur triées par nom', async () => {
      await f.repo.create('g1', 'zen', 'u1');
      await f.repo.create('g1', 'Apéro', 'u1');
      await f.repo.create('g1', 'matin', 'u1');
      await f.repo.create('g2', 'autre', 'u1');
      expect((await f.repo.list('g1')).map((p) => p.name)).toEqual(['Apéro', 'matin', 'zen']);
      expect(await f.repo.list('g3')).toEqual([]);
    });

    it('renomme, y compris en changeant seulement la casse', async () => {
      const p = await f.repo.create('g1', 'soirée', 'u1');
      await f.repo.create('g1', 'Matin', 'u1');
      f.clock.advance(1_000);
      const r = await f.repo.rename(p.id, 'Soirée');
      expect(r).toEqual({ ...p, name: 'Soirée', updatedAt: f.clock.now() });
      await expectDomainError(f.repo.rename(p.id, 'matin'), 'PLAYLIST_EXISTS');
      await expectDomainError(f.repo.rename(randomUUID(), 'x'), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.rename('pas-un-uuid', 'x'), 'PLAYLIST_NOT_FOUND');
    });

    it('ajoute en fin de playlist et relit dans l’ordre', async () => {
      const p = await f.repo.create('g1', 'Soirée', 'u1');
      f.clock.advance(5_000);
      const a = await f.repo.addItem(p.id, t1.id, 'u1');
      const b = await f.repo.addItem(p.id, t2.id, 'u2');
      const c = await f.repo.addItem(p.id, t1.id, 'u3'); // doublon autorisé
      expect(a).toEqual({
        id: expect.any(String),
        playlistId: p.id,
        track: t1,
        position: 0,
        addedBy: 'u1',
        addedAt: f.clock.now(),
      });
      expect([b.position, c.position]).toEqual([1, 2]);
      const items = await f.repo.items(p.id);
      expect(items).toEqual([a, b, c]);
      expect(items[1]?.track).toEqual(t2);
      const [listed] = await f.repo.list('g1');
      expect(listed?.updatedAt).toEqual(f.clock.now());
    });

    it('retire un élément ; l’ajout suivant va toujours en fin', async () => {
      const p = await f.repo.create('g1', 'Soirée', 'u1');
      const a = await f.repo.addItem(p.id, t1.id, 'u1');
      const b = await f.repo.addItem(p.id, t2.id, 'u1');
      await f.repo.removeItem(p.id, b.id);
      expect((await f.repo.items(p.id)).map((i) => i.id)).toEqual([a.id]);
      const c = await f.repo.addItem(p.id, t2.id, 'u1');
      expect(c.position).toBeGreaterThan(a.position);
      await f.repo.removeItem(p.id, a.id);
      expect((await f.repo.items(p.id)).map((i) => i.id)).toEqual([c.id]);
    });

    it('signale les playlists, morceaux et éléments inconnus', async () => {
      const p = await f.repo.create('g1', 'Soirée', 'u1');
      const other = await f.repo.create('g1', 'Autre', 'u1');
      const item = await f.repo.addItem(other.id, t1.id, 'u1');
      await expectDomainError(f.repo.addItem(randomUUID(), t1.id, 'u1'), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.addItem('pas-un-uuid', t1.id, 'u1'), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.addItem(p.id, randomUUID(), 'u1'), 'NOT_FOUND');
      await expectDomainError(f.repo.addItem(p.id, 'pas-un-uuid', 'u1'), 'NOT_FOUND');
      await expectDomainError(f.repo.removeItem(p.id, item.id), 'NOT_FOUND');
      await expectDomainError(f.repo.removeItem(p.id, 'pas-un-uuid'), 'NOT_FOUND');
      await expectDomainError(f.repo.removeItem(randomUUID(), item.id), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.items(randomUUID()), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.items('pas-un-uuid'), 'PLAYLIST_NOT_FOUND');
    });

    it('supprime une playlist et ses éléments', async () => {
      const p = await f.repo.create('g1', 'Soirée', 'u1');
      await f.repo.addItem(p.id, t1.id, 'u1');
      await f.repo.delete(p.id);
      expect(await f.repo.list('g1')).toEqual([]);
      await expectDomainError(f.repo.items(p.id), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.delete(p.id), 'PLAYLIST_NOT_FOUND');
      await expectDomainError(f.repo.delete('pas-un-uuid'), 'PLAYLIST_NOT_FOUND');
      await expect(f.repo.create('g1', 'soirée', 'u2')).resolves.toBeDefined(); // nom libéré
    });
  });
}
