// PlayerEngine sur Lavalink via Shoukaku 4.3.0 (ADR 0001). Client fin : pas de file ici, pas de reprise
// automatique des lecteurs (`resumeByLibrary: false`) ; la reprise applicative arrive en phase 1 (RecoveryService).
import type { Client } from 'discord.js';
import { Connectors, type NodeOption, Shoukaku, type ShoukakuOptions } from 'shoukaku';
import { DomainError } from '../../../domain/contracts/errors.js';
import type { EngineEvent, PlayableCandidate, PlayerEngine } from '../../../domain/contracts/ports.js';
import type { GuildId } from '../../../domain/contracts/track.js';
import { NODE_STATE_CONNECTED, type PlayerPort, type ShoukakuPort } from './shoukaku-port.js';
import { translatePlayerEvent } from './translate.js';

/** Options Shoukaku imposées par l'ADR 0001 (reprise de session Lavalink côté serveur, 60 s). */
export const SHOUKAKU_OPTIONS = {
  resume: true,
  resumeTimeout: 60,
  resumeByLibrary: false,
  reconnectTries: 6,
  reconnectInterval: 5,
  restTimeout: 10,
  moveOnDisconnect: false,
  voiceConnectionTimeout: 15,
  userAgent: 'Platine (bot Discord privé)',
} as const satisfies ShoukakuOptions;

export const LAVALINK_NODE_NAME = 'main';

export function lavalinkNode(opts: { host: string; port: number; password: string }): NodeOption {
  return { name: LAVALINK_NODE_NAME, url: `${opts.host}:${opts.port}`, auth: opts.password, secure: false };
}

/** Crée le gestionnaire Shoukaku branché sur un client discord.js (connecteur officiel). */
export function createShoukaku(client: Client, node: NodeOption): Shoukaku {
  return new Shoukaku(new Connectors.DiscordJS(client), [node], SHOUKAKU_OPTIONS);
}

export class ShoukakuPlayerEngine implements PlayerEngine {
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  /** Lecteurs dont la session Lavalink a été perdue (nœud reconnecté sans reprise) : à recréer au prochain join. */
  private readonly stale = new Set<GuildId>();
  private readonly joining = new Map<GuildId, Promise<void>>();
  private nodeUp = false;

  constructor(
    private readonly shoukaku: ShoukakuPort,
    private readonly opts: { shardIdOf: (guildId: GuildId) => number },
  ) {
    shoukaku.on('ready', (_name, lavalinkResume) => {
      if (!lavalinkResume) for (const g of shoukaku.players.keys()) this.stale.add(g);
      this.nodeUp = true;
      this.emit({ type: 'nodeUp', resumed: lavalinkResume });
    });
    shoukaku.on('close', () => {
      if (!this.nodeUp) return;
      this.nodeUp = false;
      this.emit({ type: 'nodeDown' });
    });
  }

  isReady(): boolean {
    for (const n of this.shoukaku.nodes.values()) if (n.state === NODE_STATE_CONNECTED) return true;
    return false;
  }

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async join(guildId: GuildId, voiceChannelId: string): Promise<void> {
    this.assertReady();
    // Deux /play simultanés sur le même serveur : une seule connexion voix.
    const pending = this.joining.get(guildId);
    if (pending) await pending.catch(() => {});
    const p = this.doJoin(guildId, voiceChannelId).finally(() => this.joining.delete(guildId));
    this.joining.set(guildId, p);
    return p;
  }

  async leave(guildId: GuildId): Promise<void> {
    this.stale.delete(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
  }

  async play(
    guildId: GuildId,
    c: PlayableCandidate,
    opts?: { startMs?: number; paused?: boolean },
  ): Promise<void> {
    const player = this.player(guildId);
    await player.playTrack({
      track: { encoded: c.engineHandle },
      ...(opts?.startMs !== undefined ? { position: Math.max(0, Math.floor(opts.startMs)) } : {}),
      ...(opts?.paused !== undefined ? { paused: opts.paused } : {}),
    });
  }

  async stop(guildId: GuildId): Promise<void> {
    this.assertReady();
    await this.shoukaku.players.get(guildId)?.stopTrack();
  }

  async pause(guildId: GuildId, paused: boolean): Promise<void> {
    await this.player(guildId).setPaused(paused);
  }

  async seek(guildId: GuildId, positionMs: number): Promise<void> {
    await this.player(guildId).seekTo(Math.max(0, Math.floor(positionMs)));
  }

  position(guildId: GuildId): number | null {
    const p = this.shoukaku.players.get(guildId);
    return p ? p.position : null;
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async doJoin(guildId: GuildId, voiceChannelId: string): Promise<void> {
    const connection = this.shoukaku.connections.get(guildId);
    const player = this.shoukaku.players.get(guildId);
    if (connection && player && connection.channelId === voiceChannelId && !this.stale.has(guildId)) return;
    // Autre salon, connexion fermée (expulsion) ou session Lavalink perdue : on repart d'une connexion neuve.
    if (connection || player) await this.shoukaku.leaveVoiceChannel(guildId);
    this.stale.delete(guildId);
    const created = await this.shoukaku.joinVoiceChannel({
      guildId,
      channelId: voiceChannelId,
      shardId: this.opts.shardIdOf(guildId),
      deaf: true,
    });
    this.wire(guildId, created);
  }

  private wire(guildId: GuildId, p: PlayerPort): void {
    p.on('start', (data) => this.emit(translatePlayerEvent(guildId, { kind: 'start', data })));
    p.on('end', (data) => this.emit(translatePlayerEvent(guildId, { kind: 'end', data })));
    p.on('exception', (data) => this.emit(translatePlayerEvent(guildId, { kind: 'exception', data })));
    p.on('stuck', (data) => this.emit(translatePlayerEvent(guildId, { kind: 'stuck', data })));
    p.on('closed', (data) => this.emit(translatePlayerEvent(guildId, { kind: 'closed', data })));
  }

  private player(guildId: GuildId): PlayerPort {
    this.assertReady();
    const p = this.shoukaku.players.get(guildId);
    if (!p) throw new Error(`Aucun lecteur pour le serveur ${guildId} : appeler join() d'abord`);
    return p;
  }

  private assertReady(): void {
    if (!this.isReady()) throw new DomainError('ENGINE_UNAVAILABLE', 'Nœud Lavalink indisponible');
  }

  private emit(e: EngineEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch {
        // Un auditeur défaillant ne doit pas casser les autres ni Shoukaku.
      }
    }
  }
}

/**
 * Shoukaku abandonne un nœud après `reconnectTries` échecs et le retire de sa liste : sans relance, le bot
 * resterait sans Lavalink jusqu'au redémarrage. Ce chien de garde le ré-ajoute tant qu'il manque.
 */
export function startNodeWatchdog(
  shoukaku: Pick<Shoukaku, 'nodes' | 'id' | 'addNode'>,
  node: NodeOption,
  opts: { intervalMs?: number; onReAdd?: () => void } = {},
): () => void {
  const timer = setInterval(() => {
    // `id` est posé par le connecteur au `clientReady` de Discord : avant, addNode lèverait une erreur.
    if (shoukaku.id && !shoukaku.nodes.has(node.name)) {
      opts.onReAdd?.();
      shoukaku.addNode(node);
    }
  }, opts.intervalMs ?? 15_000);
  timer.unref();
  return () => clearInterval(timer);
}
