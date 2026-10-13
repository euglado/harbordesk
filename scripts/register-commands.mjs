import { REST, Routes } from 'discord.js';
import { commands } from '../src/commands.mjs';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const globalMode = process.argv.includes('--global');

if (!token || !clientId) {
  console.error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID before registering commands.');
  process.exitCode = 1;
} else if (globalMode && guildId) {
  console.error('Choose either guild registration (DISCORD_GUILD_ID) or --global, not both.');
  process.exitCode = 1;
} else if (!globalMode && !guildId) {
  console.error('Set DISCORD_GUILD_ID for a test server, or pass --global to register globally.');
  process.exitCode = 1;
} else {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = globalMode
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  try {
    await rest.put(route, { body: commands });
    console.log(`Registered ${commands.length} HarborDesk commands ${globalMode ? 'globally' : 'for the configured test server'}.`);
  } catch (error) {
    console.error('Command registration failed.', { code: error?.code ?? error?.name ?? 'unknown_error' });
    process.exitCode = 1;
  }
}
