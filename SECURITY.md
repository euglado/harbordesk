# Security Policy

## Supported versions

Security updates are provided for the latest published `v1` release.

## Report a vulnerability

Please use GitHub's **Report a vulnerability** feature for this repository instead of opening a public issue. Include the affected version, impact, and a minimal reproduction where possible. The maintainers aim to acknowledge reports within seven days.

## Security design

- HarborDesk handles slash-command and button interactions. It does not request message-content, member-list, or presence intents.
- Ticket channel visibility is denied to `@everyone` and granted only to the owner, support role, invited members, and bot.
- Ticket transcripts are not copied or uploaded. The channel topic stores only owner, support role, status, timestamps, and invited member IDs.
- Tokens belong in an ignored `.env` file or a hosting provider's secret store. Never commit bot credentials.
- Closing a ticket disables message sending for the owner and invited members; channels are retained for the server's support staff.
