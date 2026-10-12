// Connexion à la gateway Discord et routage des slash commands vers les handlers (DTO → réponse).
import {
  type ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  type Interaction,
  MessageFlags,
  Status,
} from 'discord.js';
import { DEFAULT_LOCALE, t } from '../i18n/t.js';
import type { ErrorLogger } from './errors.js';
import type { CommandEntry } from './registry.js';
import type { CommandReply } from './reply.js';

/** Au-delà, on « diffère » la réponse (Discord exige une réponse sous 3 s). */
const DEFER_AFTER_MS = 2_000;

/** Client discord.js : intents non privilégiés Guilds + GuildVoiceStates uniquement. */
export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    // Aucune mention de masse possible dans les réponses du bot.
    allowedMentions: { parse: [] },
  });
}

/** Gateway connectée et prête (sonde de santé). */
export function isGatewayReady(client: Client): boolean {
  return client.isReady() && client.ws.status === Status.Ready;
}

export interface InteractionLogger extends ErrorLogger {
  info(obj: object, msg?: string): void;
}

export function attachCommandRouter(
  client: Client,
  registry: ReadonlyMap<string, CommandEntry>,
  logger: InteractionLogger,
): void {
  client.on('interactionCreate', (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    routeCommand(interaction, registry, logger).catch((err) =>
      logger.error({ err, command: interaction.commandName }, 'Réponse à la commande impossible'),
    );
  });
}

async function routeCommand(
  i: ChatInputCommandInteraction,
  registry: ReadonlyMap<string, CommandEntry>,
  logger: InteractionLogger,
): Promise<void> {
  const entry = registry.get(i.commandName);
  if (!entry || !i.inCachedGuild()) {
    await i.reply({
      content: t(entry ? 'error.guildOnly' : 'error.unknownCommand', {}, DEFAULT_LOCALE),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const ctx = {
    guildId: i.guildId,
    userId: i.user.id,
    voiceChannelId: i.guild.voiceStates.cache.get(i.user.id)?.channelId ?? null,
  };
  logger.info({ command: i.commandName, guildId: ctx.guildId, userId: ctx.userId }, 'Commande reçue');

  const work = entry.run(ctx, i.options);
  let timer: NodeJS.Timeout | undefined;
  const slow = new Promise<'slow'>((resolve) => {
    timer = setTimeout(() => resolve('slow'), DEFER_AFTER_MS);
  });
  const first = await Promise.race([work, slow]);
  clearTimeout(timer);

  if (first !== 'slow') {
    await i.reply(toPayload(first));
    return;
  }
  // Réponse lente (recherche YouTube, connexion voix) : réponse différée publique, puis édition.
  await i.deferReply();
  const reply = await work;
  await i.editReply({ content: reply.content });
}

function toPayload(r: CommandReply) {
  return r.ephemeral ? { content: r.content, flags: MessageFlags.Ephemeral as const } : { content: r.content };
}
