// ★ Fichier partagé (propriétaire : Intégrateur) : liste des slash commands du bot.
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { handlePlay, type PlayDeps, playCommand } from './commands/play.js';
import { handleStop, type StopDeps, stopCommand } from './commands/stop.js';
import type { CommandContext, CommandReply } from './reply.js';

/** Accès aux options d'une commande (sous-ensemble de `CommandInteractionOptionResolver`). */
export interface CommandOptions {
  getString(name: string, required: true): string;
}

export interface CommandEntry {
  readonly name: string;
  run(ctx: CommandContext, options: CommandOptions): Promise<CommandReply>;
}

/** Définitions envoyées à Discord par `deploy-commands.ts`. */
export function commandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [playCommand.toJSON(), stopCommand.toJSON()];
}

export type CommandDeps = PlayDeps & StopDeps;

export function createRegistry(deps: CommandDeps): ReadonlyMap<string, CommandEntry> {
  const entries: CommandEntry[] = [
    {
      name: playCommand.name,
      run: (ctx, o) => handlePlay(deps, { ...ctx, query: o.getString('query', true) }),
    },
    { name: stopCommand.name, run: (ctx) => handleStop(deps, ctx) },
  ];
  return new Map(entries.map((e) => [e.name, e]));
}
