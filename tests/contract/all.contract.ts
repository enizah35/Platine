// Point d'entrée : exécute toutes les suites de contrat contre un jeu de dépôts.

import { FakeClock } from '../../src/adapters/fakes/fake-clock.js';
import type { RepositoryBundle } from '../../src/adapters/repository-bundle.js';
import { describeHistoryRepositoryContract } from './history-repository.contract.js';
import { describeMatchRepositoryContract } from './match-repository.contract.js';
import { describePlayerStateRepositoryContract } from './player-state-repository.contract.js';
import { describePlaylistRepositoryContract } from './playlist-repository.contract.js';
import { describeQueueRepositoryContract } from './queue-repository.contract.js';
import { describeSettingsRepositoryContract } from './settings-repository.contract.js';
import { describeTrackRepositoryContract } from './track-repository.contract.js';

/** `create` doit rendre des dépôts vierges, horodatant avec `clock`. */
export function describeAllRepositoryContracts(
  name: string,
  create: (clock: FakeClock) => Promise<RepositoryBundle>,
): void {
  const fixture =
    <K extends keyof RepositoryBundle>(key: K) =>
    async () => {
      const clock = new FakeClock('2026-03-01T12:00:00.000Z');
      const repos = await create(clock);
      return { repo: repos[key], tracks: repos.tracks, clock };
    };
  describeTrackRepositoryContract(name, fixture('tracks'));
  describeQueueRepositoryContract(name, fixture('queue'));
  describePlayerStateRepositoryContract(name, fixture('playerState'));
  describeMatchRepositoryContract(name, fixture('matches'));
  describePlaylistRepositoryContract(name, fixture('playlists'));
  describeHistoryRepositoryContract(name, fixture('history'));
  describeSettingsRepositoryContract(name, fixture('settings'));
}
