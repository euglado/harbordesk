import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import {
  addTicketGuest,
  canManageTicket,
  findOpenTicket,
  MAX_GUESTS,
  makeClosedChannelName,
  makeOpenButtonId,
  makeTicketChannelName,
  makeTicketTopic,
  parseOpenButtonId,
  parseTicketTopic,
} from './domain.mjs';

const PRIVATE_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

function canBotManageChannel(member, channel) {
  try {
    return channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels) ?? false;
  } catch {
    return false;
  }
}

function roleIdsFor(interaction) {
  const roles = interaction.member?.roles;
  if (roles?.cache?.keys) return [...roles.cache.keys()];
  if (Array.isArray(roles)) return roles;
  return [];
}

function actorFor(interaction) {
  return {
    actorId: interaction.user.id,
    roleIds: roleIdsFor(interaction),
    manageChannels: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)),
  };
}

function isTicketTextChannel(channel) {
  return channel?.type === ChannelType.GuildText;
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) return interaction.editReply({ content, allowedMentions: { parse: [] } });
  return interaction.reply(payload);
}

function reportError(logger, label, error) {
  logger.error(label, { code: error?.code ?? error?.name ?? 'unknown_error' });
}

function makePanelMessage(category, supportRole) {
  const embed = new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle('Support desk')
    .setDescription('Need help from the team? Open a private ticket below. Only you and the support team can see it; members you invite will also get access.')
    .setFooter({ text: 'HarborDesk · Please do not share passwords or recovery codes.' });
  const button = new ButtonBuilder()
    .setCustomId(makeOpenButtonId(category.id, supportRole.id))
    .setLabel('Open a ticket')
    .setStyle(ButtonStyle.Primary);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)],
    allowedMentions: { parse: [] },
  };
}

async function findTicketChannels(guild) {
  const channels = await guild.channels.fetch();
  return [...channels.values()].filter(isTicketTextChannel);
}

function hasTicketAccess(interaction, metadata) {
  return canManageTicket(actorFor(interaction), metadata);
}

async function addCloseNotice(channel, actorId, reason = '') {
  const reasonLine = reason ? `\nReason: ${reason.replace(/[\r\0]/g, '').slice(0, 500)}` : '';
  await channel.send({
    content: `Ticket closed by <@${actorId}>.${reasonLine}`,
    allowedMentions: { parse: [] },
  });
}

async function closeTicket(interaction, logger, reason = '') {
  const channel = interaction.channel;
  if (!interaction.inGuild() || !isTicketTextChannel(channel)) {
    await replyEphemeral(interaction, 'Use this command inside a HarborDesk ticket channel.');
    return;
  }
  const metadata = parseTicketTopic(channel.topic);
  if (!metadata) {
    await replyEphemeral(interaction, 'This channel is not a HarborDesk ticket.');
    return;
  }
  if (metadata.status === 'closed') {
    await replyEphemeral(interaction, 'This ticket is already closed.');
    return;
  }
  if (!hasTicketAccess(interaction, metadata)) {
    await replyEphemeral(interaction, 'Only the ticket owner or support staff can close this ticket.');
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const actorId = interaction.user.id;
    for (const memberId of [metadata.ownerId, ...metadata.guests]) {
      await channel.permissionOverwrites.edit(memberId, {
        SendMessages: false,
        AttachFiles: false,
      });
    }
    const closedTopic = makeTicketTopic({
      ...metadata,
      status: 'closed',
      closedBy: actorId,
      closedAt: Date.now(),
    });
    await channel.setTopic(closedTopic);
    await channel.setName(makeClosedChannelName(channel.name)).catch((error) => reportError(logger, 'Ticket channel rename failed.', error));
    await addCloseNotice(channel, actorId, reason).catch((error) => reportError(logger, 'Ticket close notice could not be posted.', error));
    await interaction.editReply({ content: 'Ticket closed. The conversation remains available to its owner and support staff.' });
  } catch (error) {
    reportError(logger, 'Ticket close failed.', error);
    await replyEphemeral(interaction, 'Could not close the ticket. Check that HarborDesk still has Manage Channels permission.');
  }
}

function withUserLock(locks, key, operation) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  locks.set(key, current);
  return previous.then(operation).finally(() => {
    release();
    if (locks.get(key) === current) locks.delete(key);
  });
}

export function createTicketService({ logger = console } = {}) {
  const openingLocks = new Map();

  async function handlePanel(interaction) {
    if (!interaction.inGuild()) {
      await replyEphemeral(interaction, 'This command is available in a server.');
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyEphemeral(interaction, 'A server manager must post the ticket panel.');
      return;
    }
    const category = interaction.options.getChannel('category', true);
    const supportRole = interaction.options.getRole('support-role', true);
    if (category.type !== ChannelType.GuildCategory || category.guildId !== interaction.guildId) {
      await replyEphemeral(interaction, 'Choose a category from this server.');
      return;
    }
    if (supportRole.guild.id !== interaction.guildId || supportRole.id === interaction.guildId) {
      await replyEphemeral(interaction, 'Choose a support role from this server, not @everyone.');
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (!canBotManageChannel(botMember, category)) {
        await interaction.editReply('HarborDesk needs Manage Channels in the selected ticket category.');
        return;
      }
      const panelPermissions = interaction.channel.permissionsFor(botMember);
      if (!panelPermissions?.has(PermissionFlagsBits.SendMessages) || !panelPermissions?.has(PermissionFlagsBits.EmbedLinks)) {
        await interaction.editReply('HarborDesk needs Send Messages and Embed Links in this panel channel.');
        return;
      }
      const panel = await interaction.channel.send(makePanelMessage(category, supportRole));
      await interaction.editReply(`Ticket panel posted: ${panel.url}`);
    } catch (error) {
      reportError(logger, 'Ticket panel setup failed.', error);
      await interaction.editReply('Could not post the ticket panel. Check HarborDesk channel permissions and try again.');
    }
  }

  async function handleOpenButton(interaction) {
    if (!interaction.inGuild()) {
      await replyEphemeral(interaction, 'Tickets can only be opened in a server.');
      return;
    }
    const panel = parseOpenButtonId(interaction.customId);
    if (!panel) {
      await replyEphemeral(interaction, 'This ticket panel is invalid. Ask a server manager to post a new one.');
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    return withUserLock(openingLocks, `${interaction.guildId}:${interaction.user.id}`, async () => {
      let createdChannel;
      try {
        const [category, supportRole, botMember] = await Promise.all([
          interaction.guild.channels.fetch(panel.categoryId),
          interaction.guild.roles.fetch(panel.supportRoleId),
          interaction.guild.members.me ? Promise.resolve(interaction.guild.members.me) : interaction.guild.members.fetchMe(),
        ]);
        if (!category || category.type !== ChannelType.GuildCategory || category.guildId !== interaction.guildId || !supportRole || supportRole.id === interaction.guildId) {
          await interaction.editReply('The configured category or support role no longer exists. Ask a server manager to post a new panel.');
          return;
        }
        if (!canBotManageChannel(botMember, category)) {
          await interaction.editReply('HarborDesk needs Manage Channels in the configured ticket category.');
          return;
        }
        const existing = findOpenTicket(await findTicketChannels(interaction.guild), interaction.user.id);
        if (existing) {
          await interaction.editReply(`You already have an open ticket: <#${existing.id}>`);
          return;
        }

        const topic = makeTicketTopic({ ownerId: interaction.user.id, supportRoleId: supportRole.id });
        createdChannel = await interaction.guild.channels.create({
          name: makeTicketChannelName(interaction.user.username, interaction.user.id),
          type: ChannelType.GuildText,
          parent: category.id,
          topic,
          permissionOverwrites: [
            { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: PRIVATE_CHANNEL_PERMISSIONS },
            { id: supportRole.id, allow: PRIVATE_CHANNEL_PERMISSIONS },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
          ],
          reason: `HarborDesk ticket opened by ${interaction.user.id}`,
        });

        await createdChannel.send({
          content: `<@${interaction.user.id}> Your private ticket is ready. Use /ticket-add to invite a member and /ticket-close when the request is resolved.`,
          allowedMentions: { users: [interaction.user.id], parse: [] },
        });
        await interaction.editReply(`Your private ticket is ready: <#${createdChannel.id}>`);
      } catch (error) {
        if (createdChannel) await createdChannel.delete('Ticket setup did not finish').catch(() => {});
        reportError(logger, 'Ticket creation failed.', error);
        const permissionFailure = String(error?.code) === '50013';
        await interaction.editReply(permissionFailure
          ? 'HarborDesk is missing a required channel permission. Ask a server manager to check the setup guide.'
          : 'Could not open a ticket right now. Please try again in a moment.');
      }
    });
  }

  async function handleAdd(interaction) {
    const channel = interaction.channel;
    const metadata = interaction.inGuild() && isTicketTextChannel(channel) ? parseTicketTopic(channel.topic) : null;
    if (!metadata) {
      await replyEphemeral(interaction, 'Use this command inside a HarborDesk ticket channel.');
      return;
    }
    if (!hasTicketAccess(interaction, metadata)) {
      await replyEphemeral(interaction, 'Only the ticket owner or support staff can invite a member.');
      return;
    }
    const member = interaction.options.getUser('member', true);
    if (!member || member.bot) {
      await replyEphemeral(interaction, 'Choose a human member of this server.');
      return;
    }
    const result = addTicketGuest(metadata, member.id);
    if (!result.ok) {
      const messages = {
        ticket_closed: 'This ticket is closed.',
        invalid_user: 'That member could not be added.',
        already_has_access: 'That member already has ticket access.',
        guest_limit: `A ticket can have up to ${MAX_GUESTS} invited members.`,
      };
      await replyEphemeral(interaction, messages[result.reason]);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const topic = makeTicketTopic({ ...metadata, guests: result.guests });
      await channel.setTopic(topic);
      try {
        await channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      } catch (error) {
        await channel.setTopic(makeTicketTopic(metadata)).catch(() => {});
        throw error;
      }
      await channel.send({ content: `A member was added to this ticket by <@${interaction.user.id}>.`, allowedMentions: { parse: [] } })
        .catch((error) => reportError(logger, 'Ticket member notice could not be posted.', error));
      await interaction.editReply('Member added to the ticket.');
    } catch (error) {
      reportError(logger, 'Ticket member add failed.', error);
      await interaction.editReply('Could not add that member. Check HarborDesk channel permissions and try again.');
    }
  }

  async function handleChatInput(interaction) {
    if (interaction.commandName === 'ticket-panel') return handlePanel(interaction);
    if (interaction.commandName === 'ticket-close') return closeTicket(interaction, logger, interaction.options.getString('reason') ?? '');
    if (interaction.commandName === 'ticket-add') return handleAdd(interaction);
  }

  async function handleButton(interaction) {
    if (interaction.customId.startsWith('harbordesk:open:')) return handleOpenButton(interaction);
    if (interaction.customId === 'harbordesk:close:v1') return closeTicket(interaction, logger);
  }

  return { handleChatInput, handleButton };
}
