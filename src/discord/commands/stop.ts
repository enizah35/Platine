// /stop — arrête la lecture et quitte le salon vocal.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { DomainError } from '../../domain/contracts/errors.js';
import type { PlayerEngine } from '../../domain/contracts/ports.js';
import type { SettingsRepository } from '../../domain/contracts/repositories.js';
import { allLocales, t } from '../../i18n/t.js';
import { type ErrorLogger, errorReply } from '../errors.js';
import type { HistoryRecorder } from '../history-recorder.js';
import { guildLocale } from '../locale.js';
import type { CommandContext, CommandReply } from '../reply.js';

export interface StopDeps {
  engine: PlayerEngine;
  settings: SettingsRepository;
  recorder?: HistoryRecorder;
  logger?: ErrorLogger;
}

export const stopCommand = (() => {
  const d = allLocales('command.stop.description');
  return new SlashCommandBuilder()
    .setName('stop')
    .setDescription(d.fr)
    .setDescriptionLocalizations({ 'en-US': d.en, 'en-GB': d.en })
    .setContexts(InteractionContextType.Guild);
})();

export async function handleStop(deps: StopDeps, input: CommandContext): Promise<CommandReply> {
  const locale = await guildLocale(deps.settings, input.guildId);
  try {
    const playing = deps.engine.position(input.guildId) !== null;
    if (!playing) {
      // Rien en cours : on quitte quand même un éventuel salon (sans échec si le moteur est absent).
      if (deps.engine.isReady()) await deps.engine.leave(input.guildId);
      return { content: t('stop.nothing', {}, locale), ephemeral: true };
    }
    if (!deps.engine.isReady()) throw new DomainError('ENGINE_UNAVAILABLE');
    await deps.recorder?.finish(input.guildId, 'stopped');
    await deps.engine.stop(input.guildId);
    await deps.engine.leave(input.guildId);
    return { content: t('stop.done', {}, locale), ephemeral: false };
  } catch (e) {
    return errorReply(e, locale, deps.logger);
  }
}
