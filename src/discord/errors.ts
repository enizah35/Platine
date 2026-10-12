import { isDomainError } from '../domain/contracts/errors.js';
import { type Locale, type MessageKey, type Params, t } from '../i18n/t.js';
import type { CommandReply } from './reply.js';

export interface ErrorLogger {
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Traduit une erreur en réponse utilisateur (éphémère). Les erreurs non métier sont journalisées. */
export function errorReply(e: unknown, locale: Locale, logger?: ErrorLogger, params: Params = {}): CommandReply {
  if (isDomainError(e)) {
    return { content: t(`error.${e.code}` as MessageKey, params, locale), ephemeral: true };
  }
  logger?.error({ err: e }, 'Erreur inattendue pendant une commande');
  return { content: t('error.generic', {}, locale), ephemeral: true };
}
