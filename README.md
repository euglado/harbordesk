# HarborDesk

[![CI](https://github.com/euglado/harbordesk/actions/workflows/ci.yml/badge.svg)](https://github.com/euglado/harbordesk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

HarborDesk is a Discord support-ticket bot. It posts a button panel, opens private text channels for requests, lets the owner invite up to ten members, and closes tickets without deleting their history.

HarborDesk uses Discord slash commands and buttons. It does not read ordinary server messages, ask for privileged Gateway intents, collect transcripts, or send ticket content to an external service.

[Türkçe README](README.tr.md) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Features

- Post a reusable ticket panel in a channel with `/ticket-panel`.
- Create one private support channel per member at a time.
- Grant access to the ticket owner, selected support role, and up to 10 invited members.
- Use `/ticket-add` to invite someone and `/ticket-close` to lock the conversation.
- Retain closed channels for the support team; HarborDesk never deletes a ticket or exports a transcript.
- Keep ticket metadata in the Discord channel topic so open tickets can be found after a restart.
- Serialize simultaneous ticket opens from the same member in one process.

## Requirements

- Node.js 24.17 or newer.
- A Discord application with a bot user and a server where you can install it.
- A continuously running Node.js process for the bot.

The current [discord.js 14.27 documentation](https://discord.js.org/docs/packages/discord.js/14.27.0) lists Node.js 24.17 or newer. HarborDesk pins that library version and enforces the runtime requirement in `package.json`.

## Create and invite the Discord application

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On its **Bot** page, create or reset the bot token. Store the token privately; do not paste it into an issue or commit it.
3. In **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes.
4. Select these bot permissions: **Manage Channels**, **View Channels**, **Send Messages**, and **Embed Links**. The generated permission value is `19472`.
5. Use the generated invite URL to add the bot to your test server.

HarborDesk only subscribes to the `Guilds` Gateway intent. It does not need Message Content, Guild Members, or Presence intents. Discord's slash-command model and bot permissions are documented in the [application commands guide](https://docs.discord.com/developers/docs/interactions/slash-commands) and [permissions reference](https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx).

## Configure and run

```sh
git clone https://github.com/euglado/harbordesk.git
cd harbordesk
npm ci
```

Copy `.env.example` to `.env`, then fill in:

```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-test-server-id
```

Keep `.env` private. It is ignored by Git. Register the commands to your test server and start the bot:

```sh
npm run commands:register
npm start
```

Guild-scoped commands update quickly and are the recommended way to test. After testing, global command registration is available with `npm run commands:register -- --global`. Global registration replaces the application's command list, so use a dedicated HarborDesk application or verify that replacing every command is intended.

## Set up the support panel

1. Create a category for tickets and a support role in your server.
2. Make sure HarborDesk has **Manage Channels** access in the selected category. It also needs **Send Messages** and **Embed Links** in the channel where you post the panel.
3. In Discord, run `/ticket-panel`, choose the ticket category and support role, and send the panel.
4. Members press **Open a ticket**. The new channel is hidden from `@everyone` and visible to the requester, support role, and bot.
5. The requester or a support member can use `/ticket-add` to grant another member access, then `/ticket-close` when the request is resolved.

The ticket owner, support role, open/closed state, timestamps, and invited member IDs are stored in the channel topic. Ticket messages stay in Discord. HarborDesk does not make transcript files, export messages, or remove closed channels. Server staff can delete or archive closed channels using Discord's normal tools.

## Commands

| Command | Who can use it | What it does |
| --- | --- | --- |
| `/ticket-panel category support-role` | Members with Manage Server | Posts a ticket panel. |
| `/ticket-add member` | Ticket owner or support staff | Grants a server member access to an open ticket. Limit: 10 invited members. |
| `/ticket-close reason` | Ticket owner, support staff, or a channel manager | Stops the owner and invited members from sending; leaves the channel for staff. |

HarborDesk permits only one open ticket per member in a server. Closed tickets remain in their category and can be deleted by server staff when retention rules allow.

## Permissions

HarborDesk requests only the bot permissions needed for its ticket workflow. It does not request Administrator, Manage Roles, or moderation permissions. The `/ticket-panel` command is restricted to members with Manage Server; ticket access is checked again by the bot for add and close commands.

When a ticket is created, `@everyone` is explicitly denied channel visibility. The requester, configured support role, and bot receive only the channel permissions they need. Support roles should be managed by the server owner; HarborDesk does not create or assign roles.

## Development and tests

```sh
npm ci
npm run check
npm audit --audit-level=high
```

The automated tests cover ticket IDs, topic parsing, access rules, duplicate prevention logic, guest limits, channel naming, and command configuration. They do not need a Discord token or live server. CI runs these checks with Node.js 24.17.

For local testing, use a dedicated test server and a test Discord application. Do not use real customer or private ticket content in test fixtures.

## Operations and limitations

- Run a single bot process for each application. Simultaneous opens are serialized within that process; multiple replicas are not coordinated.
- If a panel's category or support role is deleted, post a new panel with valid settings.
- HarborDesk does not provide automatic transcript export, ticket deletion, or scheduled retention. Server staff control channel retention.
- Discord must be reachable for interactions and channel operations. Keep the process running on a host that can connect to Discord.
- Back up your Discord application token securely and rotate it in the Developer Portal if it is exposed.

## License

HarborDesk is available under the [MIT License](LICENSE).
