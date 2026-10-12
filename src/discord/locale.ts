import type { SettingsRepository } from '../domain/contracts/repositories.js';
import type { GuildId } from '../domain/contracts/track.js';
import { DEFAULT_LOCALE, type Locale } from '../i18n/t.js';

/** Langue du serveur (réglages), FR si la base ne répond pas : une réponse vaut mieux qu'aucune. */
export async function guildLocale(settings: SettingsRepository, guildId: GuildId): Promise<Locale> {
  try {
    return (await settings.get(guildId)).locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}
