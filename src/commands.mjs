export const commands = [
  {
    name: 'ticket-panel',
    description: 'Post a panel that members can use to open private support tickets.',
    type: 1,
    default_member_permissions: '32',
    contexts: [0],
    options: [
      {
        type: 7,
        name: 'category',
        description: 'Category where private ticket channels will be created.',
        required: true,
        channel_types: [4],
      },
      {
        type: 8,
        name: 'support-role',
        description: 'Role that can view and help in tickets.',
        required: true,
      },
    ],
  },
  {
    name: 'ticket-close',
    description: 'Close the current private support ticket.',
    type: 1,
    contexts: [0],
    options: [
      {
        type: 3,
        name: 'reason',
        description: 'Optional short note shown in the ticket channel.',
        required: false,
        max_length: 500,
      },
    ],
  },
  {
    name: 'ticket-add',
    description: 'Give another server member access to this ticket.',
    type: 1,
    contexts: [0],
    options: [
      {
        type: 6,
        name: 'member',
        description: 'Member who should be able to view and reply.',
        required: true,
      },
    ],
  },
];
