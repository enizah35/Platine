// Sous-ensemble de Shoukaku 4.3.0 utilisé par l'adaptateur. `Shoukaku` le satisfait tel quel ;
// les tests fournissent un faux émetteur qui l'implémente (aucun réseau, aucun Lavalink).
import type {
  PlayOptions,
  TrackEndEvent,
  TrackExceptionEvent,
  TrackStartEvent,
  TrackStuckEvent,
  VoiceChannelOptions,
  WebSocketClosedEvent,
} from 'shoukaku';

/** `Constants.State.CONNECTED` de Shoukaku. */
export const NODE_STATE_CONNECTED = 1;

export interface PlayerPort {
  readonly guildId: string;
  position: number;
  on(event: 'start', listener: (data: TrackStartEvent) => void): unknown;
  on(event: 'end', listener: (data: TrackEndEvent) => void): unknown;
  on(event: 'exception', listener: (data: TrackExceptionEvent) => void): unknown;
  on(event: 'stuck', listener: (data: TrackStuckEvent) => void): unknown;
  on(event: 'closed', listener: (data: WebSocketClosedEvent) => void): unknown;
  playTrack(options: PlayOptions): Promise<void>;
  stopTrack(): Promise<void>;
  setPaused(paused?: boolean): Promise<void>;
  seekTo(position: number): Promise<void>;
}

export interface ShoukakuPort {
  readonly nodes: ReadonlyMap<string, { readonly state: number }>;
  readonly connections: ReadonlyMap<string, { readonly channelId: string | null }>;
  readonly players: ReadonlyMap<string, PlayerPort>;
  on(event: 'ready', listener: (name: string, lavalinkResume: boolean, libraryResume: boolean) => void): unknown;
  on(event: 'close', listener: (name: string, code: number, reason: string) => void): unknown;
  joinVoiceChannel(options: VoiceChannelOptions): Promise<PlayerPort>;
  leaveVoiceChannel(guildId: string): Promise<void>;
}
