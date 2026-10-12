import { DomainError } from '../../domain/contracts/errors.js';
import type { EngineEvent, PlayableCandidate, PlayerEngine } from '../../domain/contracts/ports.js';
import type { GuildId } from '../../domain/contracts/track.js';

export type EngineCall =
  | { method: 'join'; guildId: GuildId; voiceChannelId: string }
  | { method: 'leave'; guildId: GuildId }
  | {
      method: 'play';
      guildId: GuildId;
      candidate: PlayableCandidate;
      opts?: { startMs?: number; paused?: boolean };
    }
  | { method: 'stop'; guildId: GuildId }
  | { method: 'pause'; guildId: GuildId; paused: boolean }
  | { method: 'seek'; guildId: GuildId; positionMs: number };

export interface FakeGuildPlayer {
  voiceChannelId: string | null;
  current: PlayableCandidate | null;
  paused: boolean;
}

/**
 * Moteur de lecture factice : enregistre les appels, tient un état minimal par serveur et laisse le test
 * émettre des `EngineEvent`. Il n'émet RIEN de lui-même (pas de `trackStart` automatique) : le test décide.
 * Quand `isReady()` est faux, toutes les commandes échouent avec `DomainError('ENGINE_UNAVAILABLE')`.
 * `emit({ type: 'nodeDown' })` / `emit({ type: 'nodeUp' })` basculent aussi `isReady`.
 */
export class FakePlayerEngine implements PlayerEngine {
  readonly calls: EngineCall[] = [];
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  private readonly guilds = new Map<GuildId, FakeGuildPlayer>();
  private readonly positions = new Map<GuildId, number>();
  private readonly failures = new Map<EngineCall['method'], Error[]>();
  private ready = true;

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  /** La prochaine invocation de `method` échoue avec `error` (empilable). */
  failNext(method: EngineCall['method'], error: Error = new Error(`${method} : échec simulé`)): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), error]);
  }

  setPosition(guildId: GuildId, positionMs: number | null): void {
    if (positionMs === null) this.positions.delete(guildId);
    else this.positions.set(guildId, positionMs);
  }

  emit(e: EngineEvent): void {
    if (e.type === 'nodeDown') this.ready = false;
    if (e.type === 'nodeUp') this.ready = true;
    for (const l of [...this.listeners]) l(e);
  }

  /** État courant d'un serveur (copie), ou undefined s'il n'a jamais été joint. */
  state(guildId: GuildId): FakeGuildPlayer | undefined {
    const s = this.guilds.get(guildId);
    return s ? { ...s } : undefined;
  }

  callsOf<M extends EngineCall['method']>(method: M): Extract<EngineCall, { method: M }>[] {
    return this.calls.filter((c): c is Extract<EngineCall, { method: M }> => c.method === method);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  // ── PlayerEngine ──────────────────────────────────────────────────────────

  async join(guildId: GuildId, voiceChannelId: string): Promise<void> {
    this.record({ method: 'join', guildId, voiceChannelId });
    this.guild(guildId).voiceChannelId = voiceChannelId;
  }

  async leave(guildId: GuildId): Promise<void> {
    this.record({ method: 'leave', guildId });
    this.guilds.delete(guildId);
    this.positions.delete(guildId);
  }

  async play(
    guildId: GuildId,
    c: PlayableCandidate,
    opts?: { startMs?: number; paused?: boolean },
  ): Promise<void> {
    this.record(
      opts ? { method: 'play', guildId, candidate: c, opts } : { method: 'play', guildId, candidate: c },
    );
    const g = this.guild(guildId);
    g.current = c;
    g.paused = opts?.paused ?? false;
    this.positions.set(guildId, opts?.startMs ?? 0);
  }

  async stop(guildId: GuildId): Promise<void> {
    this.record({ method: 'stop', guildId });
    this.guild(guildId).current = null;
    this.positions.delete(guildId);
  }

  async pause(guildId: GuildId, paused: boolean): Promise<void> {
    this.record({ method: 'pause', guildId, paused });
    this.guild(guildId).paused = paused;
  }

  async seek(guildId: GuildId, positionMs: number): Promise<void> {
    this.record({ method: 'seek', guildId, positionMs });
    this.positions.set(guildId, positionMs);
  }

  position(guildId: GuildId): number | null {
    return this.positions.get(guildId) ?? null;
  }

  isReady(): boolean {
    return this.ready;
  }

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ──────────────────────────────────────────────────────────────────────────

  private record(call: EngineCall): void {
    this.calls.push(call);
    const queued = this.failures.get(call.method);
    const err = queued?.shift();
    if (err) throw err;
    if (!this.ready) throw new DomainError('ENGINE_UNAVAILABLE', 'Nœud audio indisponible (fake)');
  }

  private guild(guildId: GuildId): FakeGuildPlayer {
    let g = this.guilds.get(guildId);
    if (!g) {
      g = { voiceChannelId: null, current: null, paused: false };
      this.guilds.set(guildId, g);
    }
    return g;
  }
}
