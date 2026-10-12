import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerSnapshot, PlayerStateRepository } from '../../src/domain/contracts/repositories.js';
import { type ContractFactory, type ContractFixture, uniqueTrack } from './helpers.js';

export function describePlayerStateRepositoryContract(
  name: string,
  factory: ContractFactory<PlayerStateRepository>,
): void {
  describe(`PlayerStateRepository (${name})`, () => {
    let f: ContractFixture<PlayerStateRepository>;
    let snap: (over?: Partial<PlayerSnapshot>) => PlayerSnapshot;
    beforeEach(async () => {
      f = await factory();
      const track = await f.tracks.upsert(uniqueTrack());
      const queueItemId = randomUUID();
      snap = (over = {}) => ({
        guildId: 'g1',
        voiceChannelId: 'v1',
        textChannelId: 't1',
        panelMessageId: 'm1',
        currentQueueItemId: queueItemId,
        currentTrackId: track.id,
        positionMs: 42_000,
        positionAt: new Date('2026-03-01T10:00:00Z'),
        paused: false,
        loopMode: 'queue',
        autoplay: true,
        status: 'playing',
        updatedAt: new Date('2026-03-01T10:00:01Z'),
        ...over,
      });
    });

    it('rend null pour un serveur inconnu', async () => {
      expect(await f.repo.load('inconnu')).toBeNull();
    });

    it('enregistre et relit un instantané, puis l’écrase', async () => {
      await f.repo.save(snap());
      expect(await f.repo.load('g1')).toEqual(snap());
      const idle = snap({
        status: 'idle',
        panelMessageId: null,
        currentQueueItemId: null,
        currentTrackId: null,
        positionMs: 0,
        loopMode: 'off',
        paused: true,
      });
      await f.repo.save(idle);
      expect(await f.repo.load('g1')).toEqual(idle);
    });

    it('listActive rend les lecteurs playing, paused et recovering, triés par serveur', async () => {
      await f.repo.save(snap({ guildId: 'g4', status: 'recovering' }));
      await f.repo.save(snap({ guildId: 'g1', status: 'playing' }));
      await f.repo.save(snap({ guildId: 'g2', status: 'idle' }));
      await f.repo.save(snap({ guildId: 'g3', status: 'paused', paused: true }));
      await f.repo.save(snap({ guildId: 'g5', status: 'left_idle' }));
      const active = await f.repo.listActive();
      expect(active.map((s) => [s.guildId, s.status])).toEqual([
        ['g1', 'playing'],
        ['g3', 'paused'],
        ['g4', 'recovering'],
      ]);
    });
  });
}
