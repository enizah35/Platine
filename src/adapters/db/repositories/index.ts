import type { Clock } from '../../../domain/contracts/ports.js';
import type { RepositoryBundle } from '../../repository-bundle.js';
import { systemClock } from '../../system-clock.js';
import type { Db } from '../types.js';
import { DrizzleHistoryRepository } from './history.js';
import { DrizzleMatchRepository } from './matches.js';
import { DrizzlePlayerStateRepository } from './player-state.js';
import { DrizzlePlaylistRepository } from './playlists.js';
import { DrizzleQueueRepository } from './queue.js';
import { DrizzleSettingsRepository } from './settings.js';
import { DrizzleTrackRepository } from './tracks.js';

export {
  DrizzleHistoryRepository,
  DrizzleMatchRepository,
  DrizzlePlayerStateRepository,
  DrizzlePlaylistRepository,
  DrizzleQueueRepository,
  DrizzleSettingsRepository,
  DrizzleTrackRepository,
};

export function createDrizzleRepositories(db: Db, clock: Clock = systemClock): RepositoryBundle {
  return {
    tracks: new DrizzleTrackRepository(db),
    queue: new DrizzleQueueRepository(db),
    playerState: new DrizzlePlayerStateRepository(db),
    matches: new DrizzleMatchRepository(db, clock),
    playlists: new DrizzlePlaylistRepository(db, clock),
    history: new DrizzleHistoryRepository(db),
    settings: new DrizzleSettingsRepository(db, clock),
  };
}
