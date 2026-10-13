const SNOWFLAKE = /^\d{17,20}$/;
const TOPIC_PREFIX = 'harbordesk:v1;';
export const MAX_GUESTS = 10;

export function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

export function makeOpenButtonId(categoryId, supportRoleId) {
  if (!isSnowflake(categoryId) || !isSnowflake(supportRoleId)) throw new TypeError('Discord IDs must be valid snowflakes.');
  return `harbordesk:open:v1:${categoryId}:${supportRoleId}`;
}

export function parseOpenButtonId(customId) {
  const match = /^harbordesk:open:v1:(\d{17,20}):(\d{17,20})$/.exec(customId ?? '');
  return match ? { categoryId: match[1], supportRoleId: match[2] } : null;
}

export function makeTicketTopic({ ownerId, supportRoleId, status = 'open', guests = [], createdAt = Date.now(), closedBy, closedAt }) {
  if (!isSnowflake(ownerId) || !isSnowflake(supportRoleId)) throw new TypeError('Ticket owner and support role IDs must be valid snowflakes.');
  if (!['open', 'closed'].includes(status)) throw new TypeError('Ticket status must be open or closed.');
  if (!Array.isArray(guests) || guests.length > MAX_GUESTS || guests.some((id) => !isSnowflake(id))) {
    throw new TypeError(`A ticket may include up to ${MAX_GUESTS} valid guest IDs.`);
  }
  if (new Set(guests).size !== guests.length || guests.includes(ownerId)) throw new TypeError('Ticket guests must be unique and cannot include the owner.');
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new TypeError('Ticket creation time is invalid.');
  const fields = [
    TOPIC_PREFIX + `owner=${ownerId}`,
    `staff=${supportRoleId}`,
    `status=${status}`,
    `created=${createdAt}`,
    `guests=${guests.join(',')}`,
  ];
  if (status === 'closed') {
    if (!isSnowflake(closedBy) || !Number.isSafeInteger(closedAt) || closedAt < 0) throw new TypeError('Closed tickets need a valid closer and close time.');
    fields.push(`closed_by=${closedBy}`, `closed_at=${closedAt}`);
  }
  const topic = fields.join(';');
  if (topic.length > 1024) throw new TypeError('Ticket metadata is too long for a Discord channel topic.');
  return topic;
}

export function parseTicketTopic(topic) {
  if (typeof topic !== 'string' || !topic.startsWith(TOPIC_PREFIX)) return null;
  const parts = topic.slice(TOPIC_PREFIX.length).split(';');
  if (parts.some((part) => !part.includes('='))) return null;
  const pairs = parts.map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1)];
  });
  if (new Set(pairs.map(([key]) => key)).size !== pairs.length) return null;
  const fields = Object.fromEntries(pairs);
  if (!isSnowflake(fields.owner) || !isSnowflake(fields.staff) || !['open', 'closed'].includes(fields.status)) return null;
  const expectedKeys = fields.status === 'closed'
    ? ['owner', 'staff', 'status', 'created', 'guests', 'closed_by', 'closed_at']
    : ['owner', 'staff', 'status', 'created', 'guests'];
  if (pairs.length !== expectedKeys.length || pairs.some(([key]) => !expectedKeys.includes(key))) return null;
  const guests = fields.guests === '' ? [] : fields.guests.split(',');
  if (!/^\d{1,16}$/.test(fields.created) || !Number.isSafeInteger(Number(fields.created))) return null;
  if (guests.length > MAX_GUESTS || guests.some((id) => !isSnowflake(id) || id === fields.owner) || new Set(guests).size !== guests.length) return null;
  if (fields.status === 'closed' && (!isSnowflake(fields.closed_by) || !/^\d{1,16}$/.test(fields.closed_at ?? '') || !Number.isSafeInteger(Number(fields.closed_at)))) return null;
  return {
    ownerId: fields.owner,
    supportRoleId: fields.staff,
    status: fields.status,
    guests,
    createdAt: Number(fields.created),
    ...(fields.status === 'closed' ? { closedBy: fields.closed_by, closedAt: Number(fields.closed_at) } : {}),
  };
}

export function addTicketGuest(metadata, guestId) {
  if (!metadata || metadata.status !== 'open') return { ok: false, reason: 'ticket_closed' };
  if (!isSnowflake(guestId)) return { ok: false, reason: 'invalid_user' };
  if (guestId === metadata.ownerId || metadata.guests.includes(guestId)) return { ok: false, reason: 'already_has_access' };
  if (metadata.guests.length >= MAX_GUESTS) return { ok: false, reason: 'guest_limit' };
  return { ok: true, guests: [...metadata.guests, guestId] };
}

export function canManageTicket({ actorId, roleIds = [], manageChannels = false }, metadata) {
  return Boolean(metadata && metadata.status === 'open' && (
    actorId === metadata.ownerId || roleIds.includes(metadata.supportRoleId) || manageChannels
  ));
}

export function findOpenTicket(channels, ownerId) {
  for (const channel of channels) {
    const metadata = parseTicketTopic(channel.topic);
    if (metadata?.ownerId === ownerId && metadata.status === 'open') return channel;
  }
  return null;
}

export function makeTicketChannelName(username, userId) {
  if (!isSnowflake(userId)) throw new TypeError('User ID must be a valid Discord snowflake.');
  const safeName = String(username ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'member';
  return `ticket-${safeName}-${userId.slice(-4)}`;
}

export function makeClosedChannelName(currentName) {
  const base = String(currentName).replace(/^closed-/, '').slice(0, 92);
  return `closed-${base}`;
}
