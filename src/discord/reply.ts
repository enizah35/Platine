import type { Locale } from '../domain/contracts/settings.js';
import type { GuildId, UserId } from '../domain/contracts/track.js';

/** Entrée commune des handlers de commandes : un DTO simple, sans objet discord.js (testable). */
export interface CommandContext {
  guildId: GuildId;
  userId: UserId;
  /** Salon vocal où se trouve l'utilisateur, ou null. */
  voiceChannelId: string | null;
}

/** Réponse à afficher. `ephemeral` : visible seulement par l'auteur de la commande. */
export interface CommandReply {
  content: string;
  ephemeral: boolean;
}

export type { Locale };
