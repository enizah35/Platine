// Contrat figé (plan §5.3). Toute modification passe par le Chef et une ADR.
import type { PlayableCandidate } from './ports.js';
import type { EndReason, GuildId, LoopMode, QueueItem, TrackId, UserId } from './track.js';

/** Statut d'un lecteur de serveur (colonne `player_state.status`). Alias de l'union écrite en §5.3. */
export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'left_idle' | 'recovering';

export type DomainEvent =
  | {
      type: 'TrackStarted';
      guildId: GuildId;
      item: QueueItem;
      candidate: Pick<PlayableCandidate, 'source' | 'ref'>;
      at: Date;
    }
  | { type: 'TrackEnded'; guildId: GuildId; item: QueueItem; reason: EndReason; playedMs: number; at: Date }
  | {
      type: 'TrackFailed';
      guildId: GuildId;
      item: QueueItem;
      attempt: number;
      willRetry: boolean;
      error: string;
      at: Date;
    }
  | { type: 'QueueChanged'; guildId: GuildId; size: number; at: Date }
  | {
      type: 'PlayerStateChanged';
      guildId: GuildId;
      status: 'idle' | 'playing' | 'paused' | 'left_idle' | 'recovering';
      paused: boolean;
      loop: LoopMode;
      autoplay: boolean;
      at: Date;
    }
  | { type: 'PositionTick'; guildId: GuildId; positionMs: number; at: Date } // toutes les 5 s ; jamais vers Discord
  | {
      type: 'VoiceJoined' | 'VoiceLeft';
      guildId: GuildId;
      channelId: string;
      reason?: 'idle' | 'stop' | 'kicked' | 'error';
      at: Date;
    }
  | {
      type: 'RecoveryAttempted';
      guildId: GuildId;
      trigger: 'bot_restart' | 'node_down' | 'voice_closed';
      ok: boolean;
      at: Date;
    }
  | { type: 'TrackLiked'; guildId: GuildId; userId: UserId; trackId: TrackId; at: Date }
  | { type: 'WrongMatchReported'; guildId: GuildId; userId: UserId; trackId: TrackId; ref: string; at: Date }
  | { type: 'PlaylistChanged'; guildId: GuildId; playlistId: string; at: Date };

/** Nom d'un événement du domaine. */
export type DomainEventType = DomainEvent['type'];
type NarrowEvent<E, T> = E extends { type: infer K } ? (T extends K ? E & { type: T } : never) : never;
/**
 * Événement(s) correspondant à un `type` donné (typage discriminé). `Extract` ne suffit pas :
 * le membre `type: 'VoiceJoined' | 'VoiceLeft'` serait perdu.
 */
export type DomainEventOf<T extends DomainEventType> = NarrowEvent<DomainEvent, T>;
