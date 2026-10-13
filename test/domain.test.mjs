import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands.mjs';
import {
  MAX_GUESTS,
  addTicketGuest,
  canManageTicket,
  findOpenTicket,
  isSnowflake,
  makeClosedChannelName,
  makeOpenButtonId,
  makeTicketChannelName,
  makeTicketTopic,
  parseOpenButtonId,
  parseTicketTopic,
} from '../src/domain.mjs';

const ownerId = '11111111111111111';
const staffRoleId = '22222222222222222';
const guestId = '33333333333333333';

test('validates Discord snowflakes and encodes panel button IDs', () => {
  assert.equal(isSnowflake(ownerId), true);
  assert.equal(isSnowflake('not-an-id'), false);
  assert.deepEqual(parseOpenButtonId(makeOpenButtonId('44444444444444444', staffRoleId)), {
    categoryId: '44444444444444444',
    supportRoleId: staffRoleId,
  });
  assert.equal(parseOpenButtonId('harbordesk:open:v1:../x:0'), null);
  assert.throws(() => makeOpenButtonId('short', staffRoleId), /snowflakes/);
});

test('round-trips open ticket metadata without storing message content', () => {
  const topic = makeTicketTopic({ ownerId, supportRoleId: staffRoleId, createdAt: 1_700_000_000_000 });
  assert.deepEqual(parseTicketTopic(topic), {
    ownerId,
    supportRoleId: staffRoleId,
    status: 'open',
    guests: [],
    createdAt: 1_700_000_000_000,
  });
  assert.equal(topic.includes('message'), false);
});

test('round-trips closed metadata and requires valid closer data', () => {
  const open = parseTicketTopic(makeTicketTopic({ ownerId, supportRoleId: staffRoleId, createdAt: 123 }));
  const closedTopic = makeTicketTopic({ ...open, status: 'closed', closedBy: guestId, closedAt: 456 });
  assert.deepEqual(parseTicketTopic(closedTopic), {
    ownerId,
    supportRoleId: staffRoleId,
    status: 'closed',
    guests: [],
    createdAt: 123,
    closedBy: guestId,
    closedAt: 456,
  });
  assert.throws(() => makeTicketTopic({ ownerId, supportRoleId: staffRoleId, status: 'closed' }), /closer/);
});

test('rejects malformed, unknown-version, and over-limit ticket metadata', () => {
  assert.equal(parseTicketTopic('ordinary channel topic'), null);
  assert.equal(parseTicketTopic('harbordesk:v2;owner=11111111111111111'), null);
  assert.equal(parseTicketTopic('harbordesk:v1;owner=x;staff=2;status=open;created=0;guests='), null);
  assert.equal(parseTicketTopic(`harbordesk:v1;owner=${ownerId};staff=${staffRoleId};status=open;created=1`), null);
  assert.throws(() => makeTicketTopic({ ownerId, supportRoleId: staffRoleId, guests: Array(MAX_GUESTS + 1).fill(guestId) }), /up to/);
  assert.throws(() => makeTicketTopic({ ownerId, supportRoleId: staffRoleId, guests: [ownerId] }), /unique/);
});

test('adds guests once and enforces the per-ticket limit', () => {
  const metadata = { ownerId, supportRoleId: staffRoleId, status: 'open', guests: [] };
  assert.deepEqual(addTicketGuest(metadata, guestId), { ok: true, guests: [guestId] });
  assert.equal(addTicketGuest({ ...metadata, guests: [guestId] }, guestId).reason, 'already_has_access');
  assert.equal(addTicketGuest(metadata, ownerId).reason, 'already_has_access');
  assert.equal(addTicketGuest(metadata, 'bad-id').reason, 'invalid_user');
  assert.equal(addTicketGuest({ ...metadata, status: 'closed' }, guestId).reason, 'ticket_closed');
  const full = { ...metadata, guests: Array.from({ length: MAX_GUESTS }, (_, index) => String(400_000_000_000_000_000n + BigInt(index))) };
  assert.equal(addTicketGuest(full, '55555555555555555').reason, 'guest_limit');
});

test('authorizes ticket owner, support role, and channel managers only', () => {
  const metadata = { ownerId, supportRoleId: staffRoleId, status: 'open' };
  assert.equal(canManageTicket({ actorId: ownerId }, metadata), true);
  assert.equal(canManageTicket({ actorId: guestId, roleIds: [staffRoleId] }, metadata), true);
  assert.equal(canManageTicket({ actorId: guestId, manageChannels: true }, metadata), true);
  assert.equal(canManageTicket({ actorId: guestId }, metadata), false);
  assert.equal(canManageTicket({ actorId: ownerId }, { ...metadata, status: 'closed' }), false);
});

test('finds only existing open tickets owned by the selected member', () => {
  const openTopic = makeTicketTopic({ ownerId, supportRoleId: staffRoleId, createdAt: 1 });
  const closedTopic = makeTicketTopic({ ownerId, supportRoleId: staffRoleId, status: 'closed', createdAt: 2, closedBy: guestId, closedAt: 3 });
  const channels = [{ id: 'closed', topic: closedTopic }, { id: 'open', topic: openTopic }];
  assert.equal(findOpenTicket(channels, ownerId).id, 'open');
  assert.equal(findOpenTicket(channels, guestId), null);
});

test('normalizes channel names and keeps a stable user suffix', () => {
  assert.equal(makeTicketChannelName('Ålex User!!!', ownerId), `ticket-alex-user-${ownerId.slice(-4)}`);
  assert.equal(makeTicketChannelName('💬', ownerId), `ticket-member-${ownerId.slice(-4)}`);
  assert.ok(makeTicketChannelName('a'.repeat(200), ownerId).length <= 85);
  assert.equal(makeClosedChannelName('ticket-alex-1111'), 'closed-ticket-alex-1111');
  assert.ok(makeClosedChannelName('x'.repeat(200)).length <= 99);
});

test('publishes guild-only commands with narrow panel permissions', () => {
  assert.deepEqual(commands.map((command) => command.name), ['ticket-panel', 'ticket-close', 'ticket-add']);
  assert.ok(commands.every((command) => command.contexts?.length === 1 && command.contexts[0] === 0));
  assert.equal(commands[0].default_member_permissions, '32');
  assert.equal(commands[1].default_member_permissions, undefined);
  assert.equal(commands[2].default_member_permissions, undefined);
  assert.equal(commands[0].options.find((option) => option.name === 'category').channel_types[0], 4);
});
