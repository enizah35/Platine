// Règles de lecture communes à toutes les implémentations des dépôts (Drizzle et mémoire),
// pour qu'elles se comportent à l'identique (vérifié par tests/contract).
import type { PlayerStatus } from './contracts/events.js';
import type { StoredMatch } from './contracts/repositories.js';
import type { GuildSettings } from './contracts/settings.js';
import type { GuildId } from './contracts/track.js';

/** Statuts repris au démarrage (§5.6) : rendus par `PlayerStateRepository.listActive`. */
export const ACTIVE_PLAYER_STATUSES: readonly PlayerStatus[] = ['playing', 'paused', 'recovering'];

/** Source enregistrée quand `markBad` vise une référence jamais vue. */
export const UNKNOWN_MATCH_SOURCE = 'unknown';

/**
 * Choix de `MatchRepository.best` : statut `ok`, correction du serveur avant le global, puis meilleur score,
 * puis vérification la plus récente ; une référence marquée `bad` dans ce serveur est exclue.
 */
export function pickBestMatch(rows: readonly StoredMatch[], g: GuildId): StoredMatch | null {
  const bad = new Set(rows.filter((r) => r.guildId === g && r.status === 'bad').map((r) => r.sourceRef));
  const ok = rows.filter(
    (r) => r.status === 'ok' && (r.guildId === g || r.guildId === null) && !bad.has(r.sourceRef),
  );
  ok.sort(
    (a, b) =>
      Number(b.guildId !== null) - Number(a.guildId !== null) ||
      b.score - a.score ||
      b.checkedAt.getTime() - a.checkedAt.getTime(),
  );
  return ok[0] ?? null;
}

/** Patch de `SettingsRepository.update` : ignore `guildId`, `updatedAt` et les valeurs `undefined`. */
export function mergeSettings(current: GuildSettings, p: Partial<GuildSettings>, now: Date): GuildSettings {
  const next: GuildSettings = { ...current };
  for (const [k, v] of Object.entries(p)) {
    if (k === 'guildId' || k === 'updatedAt' || v === undefined) continue;
    (next as unknown as Record<string, unknown>)[k] = v;
  }
  next.updatedAt = now;
  return next;
}
