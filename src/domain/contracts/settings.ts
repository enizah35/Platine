// Contrat figé (plan §5.4, colonnes de `guild_settings` §4). Toute modification passe par le Chef et une ADR.
import type { GuildId } from './track.js';

export type Locale = 'fr' | 'en';
/** Qui contrôle la lecture. `'dj_role'` arrive en V2. */
export type ControlPolicy = 'everyone' | 'dj_role';
/**
 * Droits d'édition des playlists de serveur.
 * - `everyone_adds_owner_or_admin_removes` : tout le monde ajoute ; créateur ou admin retire et supprime (défaut).
 * - `everyone` : tout le monde ajoute, retire et supprime.
 * - `owner_or_admin` : seuls le créateur et les admins modifient.
 */
export type PlaylistEditPolicy = 'everyone_adds_owner_or_admin_removes' | 'everyone' | 'owner_or_admin';

export interface GuildSettings {
  guildId: GuildId;
  locale: Locale;
  controlPolicy: ControlPolicy;
  djRoleId: string | null;
  autoplayDefault: boolean;
  idleTimeoutS: number;
  keepQueueOnLeave: boolean;
  playlistEditPolicy: PlaylistEditPolicy;
  historyRetentionDays: number;
  updatedAt: Date;
}

/**
 * Défauts produit (plan §0). Ils vivent ICI, et `src/config/defaults.ts` les ré-exporte : le domaine
 * doit rester pur et ne peut pas importer `src/config`, alors que la config peut importer le domaine.
 * Un seul endroit à changer, lisible par le domaine, les dépôts et la configuration.
 */
export const GUILD_SETTINGS_DEFAULTS: Readonly<Omit<GuildSettings, 'guildId' | 'updatedAt'>> = Object.freeze({
  locale: 'fr',
  controlPolicy: 'everyone',
  djRoleId: null,
  autoplayDefault: true,
  idleTimeoutS: 300,
  keepQueueOnLeave: true,
  playlistEditPolicy: 'everyone_adds_owner_or_admin_removes',
  historyRetentionDays: 365,
});

/** Réglages d'un serveur jamais configuré. `updatedAt` vaut l'époque Unix (« jamais modifié »). */
export function defaultGuildSettings(guildId: GuildId): GuildSettings {
  return { guildId, ...GUILD_SETTINGS_DEFAULTS, updatedAt: new Date(0) };
}
