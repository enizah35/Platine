// Historique minimal de la phase 0 : une ligne `play_history` par morceau lancé, close à la fin.
// Sera remplacé par `domain/history` (HistoryService) en phase 1.
import type { Clock, EngineEvent, PlayerEngine } from '../domain/contracts/ports.js';
import type { HistoryRepository } from '../domain/contracts/repositories.js';
import type { EndReason, GuildId } from '../domain/contracts/track.js';
import type { ErrorLogger } from './errors.js';

const ENGINE_END_REASON: Record<Extract<EngineEvent, { type: 'trackEnd' }>['reason'], EndReason> = {
  finished: 'finished',
  loadFailed: 'failed',
  stopped: 'stopped',
  replaced: 'replaced',
  cleanup: 'stopped',
};

export class HistoryRecorder {
  private readonly current = new Map<GuildId, { id: number; startedAt: Date }>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly history: HistoryRepository,
    engine: PlayerEngine,
    private readonly clock: Clock,
    private readonly logger?: ErrorLogger,
  ) {
    this.unsubscribe = engine.on((e) => {
      // `replaced` est clos explicitement par `finish` avant de lancer le morceau suivant : l'événement
      // Lavalink arrive après et ne doit pas clore la nouvelle ligne.
      if (e.type === 'trackEnd' && e.reason !== 'replaced')
        void this.finish(e.guildId, ENGINE_END_REASON[e.reason]);
    });
  }

  /** Enregistre le morceau en cours de `guildId` (ligne déjà créée par `HistoryRepository.start`). */
  track(guildId: GuildId, id: number, startedAt: Date): void {
    this.current.set(guildId, { id, startedAt });
  }

  /** Clôt la ligne en cours du serveur, s'il y en a une (idempotent). */
  async finish(guildId: GuildId, reason: EndReason): Promise<void> {
    const cur = this.current.get(guildId);
    if (!cur) return;
    this.current.delete(guildId);
    const endedAt = this.clock.now();
    try {
      await this.history.end(cur.id, {
        endedAt,
        playedMs: Math.max(0, endedAt.getTime() - cur.startedAt.getTime()),
        endReason: reason,
      });
    } catch (err) {
      this.logger?.warn({ err, guildId }, "Historique : fin d'écoute non enregistrée");
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}
