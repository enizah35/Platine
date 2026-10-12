// Contrat figé (plan §5.2). Toute modification passe par le Chef et une ADR.
import type { CatalogTrack, GuildId } from './track.js';

export interface CatalogProvider {
  // Deezer, Spotify ; fakes en test
  readonly id: 'deezer' | 'spotify';
  search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<CatalogTrack[]>;
  resolveUrl(url: string): Promise<CatalogTrack[] | null>; // lien de titre/album/playlist ; null = pas pour moi
  related(seed: CatalogTrack, opts: { limit: number }): Promise<CatalogTrack[]>; // autoplay ; [] si non supporté
}

export interface PlayableCandidate {
  // produit par une AudioSource, consommé par PlayerEngine
  source: string; // 'youtube', plus tard 'jamendo', 'upload'…
  ref: string; // opaque pour le domaine (identifiant de la source)
  engineHandle: string; // opaque : piste encodée Lavalink
  title: string;
  author: string;
  durationMs: number;
  score: number; // 0..1, calculé par la source (durée, titre, artiste, chaîne officielle/« Topic »)
}

export interface AudioSource {
  // ★ le port à remplacer par une source légale
  readonly id: string;
  findCandidates(
    track: CatalogTrack,
    opts: { limit: number; signal?: AbortSignal },
  ): Promise<PlayableCandidate[]>;
  fromRef(ref: string): Promise<PlayableCandidate | null>; // recharge depuis playback_matches
}

export interface PlayerEngine {
  // Lavalink via Shoukaku ; fake en test
  join(guildId: GuildId, voiceChannelId: string): Promise<void>;
  leave(guildId: GuildId): Promise<void>;
  play(guildId: GuildId, c: PlayableCandidate, opts?: { startMs?: number; paused?: boolean }): Promise<void>;
  stop(guildId: GuildId): Promise<void>;
  pause(guildId: GuildId, paused: boolean): Promise<void>;
  seek(guildId: GuildId, positionMs: number): Promise<void>;
  position(guildId: GuildId): number | null; // ms, dernière valeur connue
  isReady(): boolean; // nœud Lavalink connecté
  on(listener: (e: EngineEvent) => void): () => void;
}
export type EngineEvent =
  | { type: 'trackStart'; guildId: GuildId }
  | {
      type: 'trackEnd';
      guildId: GuildId;
      reason: 'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup';
    }
  | { type: 'trackException'; guildId: GuildId; message: string; severity: 'common' | 'suspicious' | 'fault' }
  | { type: 'trackStuck'; guildId: GuildId; thresholdMs: number }
  | { type: 'voiceClosed'; guildId: GuildId; code: number; byRemote: boolean }
  | { type: 'nodeDown' }
  | { type: 'nodeUp'; resumed: boolean };

export interface Clock {
  now(): Date;
  setTimeout(fn: () => void, ms: number): () => void;
} // FakeClock en test
