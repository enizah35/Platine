import type {
  HistoryRepository,
  MatchRepository,
  PlayerStateRepository,
  PlaylistRepository,
  QueueRepository,
  SettingsRepository,
  TrackRepository,
} from '../domain/contracts/repositories.js';

/** Ensemble des dépôts du §5.4, tel que l'attend la composition root. */
export interface RepositoryBundle {
  tracks: TrackRepository;
  queue: QueueRepository;
  playerState: PlayerStateRepository;
  matches: MatchRepository;
  playlists: PlaylistRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
}
