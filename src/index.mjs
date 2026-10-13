import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { createTicketService } from './ticket-service.mjs';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('HarborDesk could not start: set DISCORD_TOKEN in the environment or .env file.');
  process.exitCode = 1;
} else {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const service = createTicketService();

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`HarborDesk is ready as ${readyClient.user.username}.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) await service.handleChatInput(interaction);
      else if (interaction.isButton()) await service.handleButton(interaction);
    } catch (error) {
      console.error('HarborDesk could not handle an interaction.', { code: error?.code ?? error?.name ?? 'unknown_error' });
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Something went wrong. Please try again later.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      client.destroy();
      process.exit(0);
    });
  }

  client.login(token).catch((error) => {
    console.error('Discord login failed. Check the bot token and application setup.', { code: error?.code ?? error?.name ?? 'unknown_error' });
    process.exitCode = 1;
  });
}
