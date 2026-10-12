// `pnpm deploy:commands` : enregistre les slash commands sur le serveur DISCORD_GUILD_ID (instantané).
// Dans l'image Docker : `node dist/discord/deploy-commands.js`.
import { REST, Routes } from 'discord.js';
import { discordEnvSchema, loadDotEnvIfPresent, loadEnvOrExit, parseEnv } from '../config/env.js';
import { commandDefinitions } from './registry.js';

loadDotEnvIfPresent();
const env = loadEnvOrExit(() => parseEnv(process.env, discordEnvSchema));
const body = commandDefinitions();
const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
try {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body });
  console.log(
    `${body.length} commande(s) enregistrée(s) sur le serveur ${env.DISCORD_GUILD_ID} : ${body.map((c) => `/${c.name}`).join(', ')}`,
  );
} catch (err) {
  console.error('Enregistrement des commandes impossible :', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
