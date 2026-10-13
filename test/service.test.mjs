import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { createTicketService } from '../src/ticket-service.mjs';
import { makeOpenButtonId, makeTicketTopic, parseTicketTopic } from '../src/domain.mjs';

const guildId = '11111111111111111';
const supportRoleId = '22222222222222222';
const userId = '33333333333333333';
const botId = '44444444444444444';
const categoryId = '55555555555555555';
const ticketId = '66666666666666666';

function makeInteraction(overrides = {}) {
  const replies = [];
  const edits = [];
  const interaction = {
    guildId,
    user: { id: userId, username: 'Taylor', bot: false },
    inGuild: () => true,
    memberPermissions: { has: () => false },
    member: { roles: { cache: new Map() } },
    reply: async (payload) => replies.push(payload),
    deferReply: async () => { interaction.deferred = true; },
    editReply: async (payload) => edits.push(payload),
    replies,
    edits,
    ...overrides,
  };
  return interaction;
}

function alwaysHas(...allowed) {
  return { has: (permission) => allowed.includes(permission) };
}

test('rejects ticket panel setup without Manage Server permission', async () => {
  const service = createTicketService({ logger: { error() {} } });
  const interaction = makeInteraction({
    commandName: 'ticket-panel',
    options: { getChannel() {}, getRole() {} },
  });
  await service.handleChatInput(interaction);
  assert.match(interaction.replies[0].content, /server manager/i);
});

test('posts a panel with a bounded button ID after permission checks', async () => {
  const category = { id: categoryId, guildId, type: ChannelType.GuildCategory };
  const role = { id: supportRoleId, guild: { id: guildId } };
  const botMember = { id: botId };
  category.permissionsFor = () => alwaysHas(PermissionFlagsBits.ManageChannels);
  const panelPermissions = alwaysHas(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks);
  let posted;
  const interaction = makeInteraction({
    commandName: 'ticket-panel',
    memberPermissions: alwaysHas(PermissionFlagsBits.ManageGuild),
    guild: { members: { me: botMember } },
    options: {
      getChannel: () => category,
      getRole: () => role,
    },
    channel: {
      permissionsFor: () => panelPermissions,
      send: async (payload) => { posted = payload; return { url: 'https://discord.com/channels/server/panel' }; },
    },
  });
  const service = createTicketService({ logger: { error() {} } });
  await service.handleChatInput(interaction);
  assert.equal(posted.embeds[0].data.title, 'Support desk');
  assert.match(posted.embeds[0].data.description, /members you invite/);
  assert.equal(posted.components[0].components[0].data.custom_id, makeOpenButtonId(categoryId, supportRoleId));
  assert.deepEqual(posted.allowedMentions, { parse: [] });
  assert.match(interaction.edits[0], /panel/);
});

test('serializes simultaneous opens and creates a private ticket once', async () => {
  const category = { id: categoryId, guildId, type: ChannelType.GuildCategory };
  category.permissionsFor = () => alwaysHas(PermissionFlagsBits.ManageChannels);
  const supportRole = { id: supportRoleId, guild: { id: guildId } };
  const botMember = { id: botId };
  let createCalls = 0;
  const channelMap = new Map([[categoryId, category]]);
  const guild = {
    members: { me: botMember, fetchMe: async () => botMember },
    roles: { fetch: async () => supportRole },
    channels: {
      fetch: async (id) => id ? category : new Map(channelMap),
      create: async (options) => {
        createCalls += 1;
        const created = {
          id: ticketId,
          type: ChannelType.GuildText,
          topic: options.topic,
          send: async () => {},
          delete: async () => {},
        };
        channelMap.set(ticketId, created);
        created.options = options;
        return created;
      },
    },
  };
  const makeButton = () => makeInteraction({
    customId: makeOpenButtonId(categoryId, supportRoleId),
    guild,
  });
  const first = makeButton();
  const second = makeButton();
  const service = createTicketService({ logger: { error() {} } });

  await Promise.all([service.handleButton(first), service.handleButton(second)]);
  assert.equal(createCalls, 1);
  const created = channelMap.get(ticketId);
  const metadata = parseTicketTopic(created.topic);
  assert.equal(metadata.ownerId, userId);
  assert.equal(metadata.supportRoleId, supportRoleId);
  assert.equal(metadata.status, 'open');
  assert.ok(created.options.permissionOverwrites.some((entry) => entry.id === guildId && entry.deny.includes(PermissionFlagsBits.ViewChannel)));
  assert.ok(created.options.permissionOverwrites.some((entry) => entry.id === userId && entry.allow.includes(PermissionFlagsBits.SendMessages)));
  assert.ok(created.options.permissionOverwrites.some((entry) => entry.id === supportRoleId && entry.allow.includes(PermissionFlagsBits.ViewChannel)));
  assert.ok(first.edits[0].includes(ticketId));
  assert.ok(second.edits[0].includes(ticketId));
});

test('rejects malformed or forged ticket button IDs before API access', async () => {
  const interaction = makeInteraction({ customId: 'harbordesk:open:v1:../../bad' });
  const service = createTicketService({ logger: { error() {} } });
  await service.handleButton(interaction);
  assert.match(interaction.replies[0].content, /invalid/i);
});

test('does not let an unrelated member close a ticket', async () => {
  const topic = 'harbordesk:v1;owner=77777777777777777;staff=88888888888888888;status=open;created=123;guests=';
  const interaction = makeInteraction({
    commandName: 'ticket-close',
    options: { getString: () => '' },
    channel: { type: ChannelType.GuildText, topic },
  });
  const service = createTicketService({ logger: { error() {} } });
  await service.handleChatInput(interaction);
  assert.match(interaction.replies[0].content, /only the ticket owner or support staff/i);
});

test('closes a ticket by locking the owner and keeping the channel', async () => {
  const topic = makeTicketTopic({ ownerId: userId, supportRoleId, guests: ['77777777777777777'] });
  const denied = [];
  const channel = {
    type: ChannelType.GuildText,
    name: 'ticket-taylor-3333',
    topic,
    permissionOverwrites: { edit: async (id, permissions) => denied.push({ id, permissions }) },
    setTopic: async (value) => { channel.topic = value; },
    setName: async (value) => { channel.name = value; },
    send: async () => {},
  };
  const interaction = makeInteraction({
    commandName: 'ticket-close',
    options: { getString: () => 'Resolved with the member.' },
    channel,
  });
  const service = createTicketService({ logger: { error() {} } });
  await service.handleChatInput(interaction);
  assert.equal(parseTicketTopic(channel.topic).status, 'closed');
  assert.equal(channel.name, 'closed-ticket-taylor-3333');
  assert.deepEqual(denied.map((entry) => entry.id), [userId, '77777777777777777']);
  assert.ok(denied.every((entry) => entry.permissions.SendMessages === false));
  assert.match(interaction.edits[0].content, /ticket closed/i);
});

test('adds a member to an open ticket after owner authorization', async () => {
  const channel = {
    type: ChannelType.GuildText,
    topic: makeTicketTopic({ ownerId: userId, supportRoleId }),
    setTopic: async (value) => { channel.topic = value; },
    permissionOverwrites: { edit: async (id, permissions) => { channel.overwrite = { id, permissions }; } },
    send: async () => {},
  };
  const interaction = makeInteraction({
    commandName: 'ticket-add',
    options: { getUser: () => ({ id: '77777777777777777', bot: false }) },
    channel,
  });
  const service = createTicketService({ logger: { error() {} } });
  await service.handleChatInput(interaction);
  const metadata = parseTicketTopic(channel.topic);
  assert.deepEqual(metadata.guests, ['77777777777777777']);
  assert.equal(channel.overwrite.id, '77777777777777777');
  assert.equal(channel.overwrite.permissions.ViewChannel, true);
  assert.equal(channel.overwrite.permissions.SendMessages, true);
  assert.match(interaction.edits[0], /member added/i);
});
