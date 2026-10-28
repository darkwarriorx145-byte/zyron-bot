const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');
const ticketAssistant = require('../utils/ticketAssistant');

const P = PermissionsBitField.Flags;

function pad(value) {
  let text = String(value);
  while (text.length < 6) text = '0' + text;
  return text;
}

function ticketChannelName(settings, digits, user, type) {
  const pattern = String(settings.ticketNamePattern || 'ticket-{{ticket_number}}');
  const cleanUser = String(user && user.username ? user.username : 'user').toLowerCase();
  const cleanType = String(type || 'support').toLowerCase();
  const name = pattern
    .split('{{ticket_number}}').join(digits)
    .split('{{ticket_id}}').join(digits)
    .split('{{user}}').join(cleanUser)
    .split('{{username}}').join(cleanUser)
    .split('{{type}}').join(cleanType)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  return name || ('ticket-' + digits);
}

function parseTopic(topic) {
  const info = { id: null, owner: null, claimed: null, type: null };

  String(topic || '').split('|').forEach(function (part) {
    const value = part.trim();
    if (value.indexOf('Ticket #') === 0) info.id = value.replace('Ticket ', '').trim();
    if (value.indexOf('owner:') === 0) info.owner = value.slice(6).trim();
    if (value.indexOf('claimed:') === 0) info.claimed = value.slice(8).trim();
    if (value.indexOf('type:') === 0) info.type = value.slice(5).trim();
  });

  return info;
}

function isTicketChannel(channel) {
  if (!channel || !channel.name) return false;
  return channel.name.indexOf('ticket-') === 0;
}

function isStaff(member, settings) {
  return ticketAssistant.isTicketStaff(member, settings);
}

function addStaffOverwrites(overwrites, guild, settings) {
  ticketAssistant.roleIds(settings).forEach(function (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return;
    if (overwrites.some(function (item) { return item.id === role.id; })) return;
    overwrites.push({
      id: role.id,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages, P.AttachFiles, P.EmbedLinks]
    });
  });
  return overwrites;
}

function ticketOverwrites(guild, settings, client, ownerId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [P.ViewChannel]
    },
    {
      id: ownerId,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks]
    },
    {
      id: client.user.id,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.EmbedLinks, P.AttachFiles]
    }
  ];

  addStaffOverwrites(overwrites, guild, settings);
  return overwrites;
}

const DEFAULT_TICKET_TITLE = '🎫 ' + config.botName + ' Support Tickets';
const DEFAULT_TICKET_DESCRIPTION =
  'Need help from our staff team?\n\n' +
  'Click a button below and a private channel will open instantly.\n\n' +
  '{{buttons}}\n\n' +
  '**Inside a ticket**\n' +
  '• Claim — staff member takes the ticket\n' +
  '• Rename — change the ticket channel name\n' +
  '• Add User — invite someone to the ticket\n' +
  '• Remove User — remove someone from the ticket\n' +
  '• Close — delete the ticket when finished\n\n' +
  '**Rules**\n' +
  '• One ticket per member\n' +
  '• Do not open fake tickets\n' +
  '• Staff will reply as soon as possible';
const DEFAULT_TICKET_FOOTER = config.botName + ' • Powered by ' + config.company;

function ticketButtonLines(buttons) {
  if (!buttons || buttons.length === 0) return '';
  const lines = buttons.map(function (button) {
    return '• ' + (button.emoji ? button.emoji + ' ' : '') + '**' + button.label + '** — ' + button.message;
  });
  return '**Ticket Types**\n' + lines.join('\n');
}

function panelEmbed(settings) {
  const descriptionTemplate = settings.ticketPanelDescription || DEFAULT_TICKET_DESCRIPTION;
  const description = descriptionTemplate.split('{{buttons}}').join(ticketButtonLines(settings.ticketButtons || []));

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(settings.ticketPanelTitle || DEFAULT_TICKET_TITLE)
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: (settings.ticketPanelFooter || DEFAULT_TICKET_FOOTER).slice(0, 2048) })
    .setTimestamp();
}

function buttonStyleFor(style) {
  if (style === 'primary') return ButtonStyle.Primary;
  if (style === 'success') return ButtonStyle.Success;
  if (style === 'danger') return ButtonStyle.Danger;
  return ButtonStyle.Secondary;
}

function buildPanelRows(settings) {
  const buttons = settings.ticketButtons || [];
  const rows = [];
  let current = new ActionRowBuilder();

  const createButton = new ButtonBuilder()
    .setCustomId('ticket:create')
    .setLabel(String(settings.ticketCreateLabel || 'Create Ticket').slice(0, 80))
    .setStyle(ButtonStyle.Primary);

  try {
    createButton.setEmoji(settings.ticketCreateEmoji || '🎫');
  } catch (err) {
    createButton.setEmoji('🎫');
  }

  current.addComponents(createButton);

  for (let i = 0; i < buttons.length; i++) {
    const data = buttons[i];
    const button = new ButtonBuilder()
      .setCustomId('ticket:custom:' + i)
      .setLabel(String(data.label).slice(0, 80))
      .setStyle(buttonStyleFor(data.style));

    if (data.emoji) {
      try {
        button.setEmoji(data.emoji);
      } catch (err) {
        button.setEmoji('🎫');
      }
    }

    current.addComponents(button);

    if (current.components.length === 5 && i < buttons.length - 1) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
  }

  rows.push(current);
  return rows;
}

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel('Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket:rename')
      .setLabel('Rename')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:add')
      .setLabel('Add User')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket:remove')
      .setLabel('Remove User')
      .setEmoji('➖')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function ticketEmbed(id, userId, claimedBy, type, intro) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎫 Ticket ' + id)
    .setDescription(
      'Hello <@' + userId + '>, a staff member will be with you shortly.\n\n' +
      '**Ticket ID:** ' + id + '\n' +
      '**Type:** ' + (type || 'General Support') + '\n' +
      '**Owner:** <@' + userId + '>\n' +
      '**Claimed by:** ' + (claimedBy ? '<@' + claimedBy + '>' : 'Unclaimed') + '\n' +
      '**Opened:** <t:' + Math.floor(Date.now() / 1000) + ':R>\n\n' +
      (intro ? '**Request:** ' + intro + '\n\n' : '') +
      'Describe your issue below. Staff can claim, rename, add or remove users, and close this ticket with the buttons.'
    )
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();
}

async function renameChannel(channel, info, rawName) {
  const digits = info.id ? String(info.id).replace('#', '') : '';
  const base = digits ? 'ticket-' + digits : 'ticket';
  const clean = String(rawName || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  const name = (base + (clean ? '-' + clean : '')).slice(0, 100);

  const renamed = await channel.setName(name, 'Ticket renamed').then(function () {
    return name;
  }).catch(function () {
    return null;
  });

  return renamed;
}

function ticketReasonModal(customId, label) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(String(label || 'Open a Ticket').slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for opening this ticket')
        .setPlaceholder('Explain your issue in a few clear sentences')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
    )
  );

  return modal;
}

async function createTicket(client, interaction, custom, reason) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const settings = db.getGuild(guild.id);
  const requestReason = String(reason || '').trim().slice(0, 1500);

  if (!requestReason) {
    return interaction.editReply({ content: 'A ticket reason is required. Please try again.' });
  }

  const existing = guild.channels.cache.find(function (channel) {
    if (!isTicketChannel(channel)) return false;
    const info = parseTopic(channel.topic);
    return info.owner === interaction.user.id;
  });

  if (existing) {
    return interaction.editReply({ content: 'You already have a ticket open: ' + existing });
  }

  const counter = (settings.ticketCounter || 0) + 1;
  db.updateGuild(guild.id, { ticketCounter: counter });

  const digits = pad(counter);
  const id = '#' + digits;
  const parent = settings.ticketCategory ? guild.channels.cache.get(settings.ticketCategory) : null;
  const type = custom ? String(custom.label).replace(/\|/g, '/') : 'General Support';
  const channelName = ticketChannelName(settings, digits, interaction.user, type);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parent ? parent.id : null,
    topic: 'Ticket ' + id + ' | owner:' + interaction.user.id + ' | claimed:none | type:' + type,
    permissionOverwrites: ticketOverwrites(guild, settings, client, interaction.user.id)
  }).catch(function () {
    return null;
  });

  if (!channel) {
    return interaction.editReply({ content: 'I could not create the ticket channel. Check my Manage Channels permission.' });
  }

  db.addTicket(guild.id, {
    number: counter,
    channelId: channel.id,
    userId: interaction.user.id,
    type: type,
    reason: requestReason,
    status: 'open'
  });

  const staffMentions = ticketAssistant.roleIds(settings).map(function (roleId) {
    return '<@&' + roleId + '>';
  });
  const mention = ('<@' + interaction.user.id + '> ' + staffMentions.join(' ')).trim();

  await channel.send({
    content: mention,
    embeds: [ticketEmbed(id, interaction.user.id, null, type, requestReason)],
    components: [ticketButtons()]
  }).catch(function () {});

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(String(requestReason).slice(0, 4096))
        .setFooter({ text: 'Ticket request' })
    ]
  }).catch(function () {});

  await interaction.editReply({ content: 'Your ticket is ready: ' + channel + ' (**' + id + '** - ' + type + ')' });

  if (settings.ticketAiEnabled !== false && settings.aiEnabled !== false) {
    ticketAssistant.firstReply({
      guild: guild,
      settings: settings,
      type: type,
      user: interaction.user,
      reason: requestReason
    }).then(function (text) {
      return channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setAuthor({ name: config.botName + ' AI Support', iconURL: client.user.displayAvatarURL() })
            .setDescription(String(text).slice(0, 4096))
            .setFooter({ text: 'AI assistant | Staff can take over at any time' })
        ]
      });
    }).catch(function (err) {
      console.error('Ticket AI reply error:', err.message);
    });
  }
}

module.exports = {
  name: 'ticket',
  aliases: ['tickets', 'support'],
  description: 'Ticket system with IDs, staff roles, custom panel buttons, claim, rename, add, remove and close.',
  usage: '[setup [#channel] [categoryID]|panel|staff @role|button add <label> | <emoji> | <message>|button remove <label>|button list|close|claim|rename <name>|add @user|remove @user|id]',
  subcommands: [
    { name: 'setup [#channel] [categoryID]', description: 'Send the panel and set the ticket category.' },
    { name: 'panel', description: 'Send the ticket panel in this channel.' },
    { name: 'staff @role', description: 'Set the staff role that can see and manage tickets.' },
    { name: 'button add <label> | <emoji> | <message>', description: 'Add a custom button to the ticket panel.' },
    { name: 'button remove <label>', description: 'Remove a custom button from the panel.' },
    { name: 'button list', description: 'List every custom panel button.' },
    { name: 'close [reason]', description: 'Close and delete the current ticket.' },
    { name: 'claim', description: 'Claim the current ticket as staff.' },
    { name: 'rename <name>', description: 'Rename the current ticket channel.' },
    { name: 'add @user', description: 'Add a user to the current ticket.' },
    { name: 'remove @user', description: 'Remove a user from the current ticket.' },
    { name: 'id', description: 'Show the ticket ID, owner, type and claim status.' }
  ],
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const canManage = message.member.permissions.has(P.ManageGuild);

    if (sub === '' || sub === 'help') {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🎫 Ticket Commands')
            .setDescription(
              '**' + prefix + 'ticket setup [#channel] [categoryID]** — send the panel\n' +
              '**' + prefix + 'ticket panel** — send the panel here\n' +
              '**' + prefix + 'ticket staff @role** — set the staff role\n' +
              '**' + prefix + 'ticket button add General Support | 🎫 | I need help** — add a panel button\n' +
              '**' + prefix + 'ticket button remove General Support** — remove a panel button\n' +
              '**' + prefix + 'ticket button list** — list panel buttons\n' +
              '**' + prefix + 'ticket close [reason]** — close this ticket\n' +
              '**' + prefix + 'ticket claim** — claim this ticket\n' +
              '**' + prefix + 'ticket rename <name>** — rename this ticket\n' +
              '**' + prefix + 'ticket add @user** — add a user\n' +
              '**' + prefix + 'ticket remove @user** — remove a user\n' +
              '**' + prefix + 'ticket id** — show the ticket ID'
            )
        ]
      });
    }

    if (sub === 'button' || sub === 'buttons') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to edit panel buttons.')] });
      }

      const action = (args[1] || '').toLowerCase();
      const buttons = (settings.ticketButtons || []).slice();

      if (action === 'add' || action === 'create') {
        if (buttons.length >= 9) {
          return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Button Limit').setDescription('You can add up to 9 custom buttons. Remove one first.')] });
        }

        const raw = args.slice(2).join(' ').trim();
        if (!raw) {
          return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing Button').setDescription('Usage: **' + prefix + 'ticket button add General Support | 🎫 | I need help**')] });
        }

        const parts = raw.split('|').map(function (part) {
          return part.trim();
        });

        const label = (parts[0] || '').slice(0, 80);
        if (!label) {
          return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing Label').setDescription('The button needs a label.')] });
        }

        buttons.push({
          label: label,
          emoji: parts[1] || '🎫',
          message: parts[2] || 'Support request'
        });

        db.updateGuild(message.guild.id, { ticketButtons: buttons });

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.success)
              .setTitle('✅ Panel Button Added')
              .setDescription('Added **' + label + '**.\nRe-run **' + prefix + 'ticket panel** to refresh the panel.')
          ]
        });
      }

      if (action === 'remove' || action === 'delete') {
        const label = args.slice(2).join(' ').trim().toLowerCase();
        if (!label) {
          return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing Label').setDescription('Usage: **' + prefix + 'ticket button remove General Support**')] });
        }

        const filtered = buttons.filter(function (button) {
          return String(button.label).toLowerCase() !== label;
        });

        if (filtered.length === buttons.length) {
          return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Button Not Found').setDescription('No panel button has that label.')] });
        }

        db.updateGuild(message.guild.id, { ticketButtons: filtered });
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Panel Button Removed').setDescription('Removed **' + label + '**.')] });
      }

      if (action === 'clear' || action === 'reset') {
        db.updateGuild(message.guild.id, { ticketButtons: [] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Panel Buttons Cleared').setDescription('All custom ticket buttons were removed.')] });
      }

      if (buttons.length === 0) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('🎫 No Custom Buttons').setDescription('Add one with **' + prefix + 'ticket button add Label | 🎫 | Message**')] });
      }

      const lines = buttons.map(function (button, index) {
        return (index + 1) + '. ' + (button.emoji ? button.emoji + ' ' : '') + '**' + button.label + '** — ' + button.message;
      });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🎫 Custom Panel Buttons')
            .setDescription(lines.join('\n'))
        ]
      });
    }

    if (sub === 'setup' || sub === 'panel') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to set up tickets.')] });
      }

      const channel = message.mentions.channels.first() || message.channel;
      const categoryId = args[2] ? String(args[2]).replace(/[<#>]/g, '') : null;

      if (categoryId && !message.guild.channels.cache.get(categoryId)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Invalid Category').setDescription('Give me a valid category ID.')] });
      }

      if (sub === 'setup') {
        db.updateGuild(message.guild.id, {
          ticketCategory: categoryId || settings.ticketCategory,
          ticketPanelChannel: channel.id
        });
      } else {
        db.updateGuild(message.guild.id, { ticketPanelChannel: channel.id });
      }

      await channel.send({ embeds: [panelEmbed(settings)], components: buildPanelRows(settings) });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Ticket Panel Ready')
            .setDescription('Panel sent to ' + channel + '. New tickets will open under ' + (categoryId ? '<#' + categoryId + '>' : (settings.ticketCategory ? '<#' + settings.ticketCategory + '>' : 'no category')) + '.')
        ]
      });
    }

    if (sub === 'staff' || sub === 'staffrole' || sub === 'role') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to set the staff role.')] });
      }

      const mentioned = message.mentions.roles.first();
      const roleId = mentioned ? mentioned.id : String(args[1] || '').replace(/[<@&>]/g, '');
      const role = mentioned || message.guild.roles.cache.get(roleId);

      if (!role) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Invalid Role').setDescription('Mention the staff role or give a valid role ID.')] });
      }

      db.updateGuild(message.guild.id, { ticketStaffRole: role.id });

      message.guild.channels.cache.forEach(function (channel) {
        if (!isTicketChannel(channel)) return;
        channel.permissionOverwrites.edit(role.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          ManageMessages: true,
          AttachFiles: true,
          EmbedLinks: true
        }).catch(function () {});
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Staff Role Set')
            .setDescription(role + ' can now see and manage every ticket. Existing tickets were updated.')
        ]
      });
    }

    if (!isTicketChannel(message.channel)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Not A Ticket').setDescription('Run that command inside a ticket channel.')] });
    }

    const info = parseTopic(message.channel.topic);
    const staff = isStaff(message.member, settings);
    const owner = info.owner === message.author.id;

    if (sub === 'id' || sub === 'info') {
      if (!staff && !owner) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('Only the ticket owner or staff can view ticket info.')] });
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🎫 Ticket Info')
            .addFields(
              { name: 'Ticket ID', value: info.id || 'Unknown', inline: true },
              { name: 'Type', value: info.type || 'General Support', inline: true },
              { name: 'Owner', value: info.owner ? '<@' + info.owner + '>' : 'Unknown', inline: true },
              { name: 'Claimed by', value: info.claimed && info.claimed !== 'none' ? '<@' + info.claimed + '>' : 'Unclaimed', inline: true }
            )
            .setFooter({ text: config.botName + ' • Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'close') {
      if (!owner && !staff) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('Only the ticket owner or staff can close this ticket.')] });
      }

      const reason = args.slice(1).join(' ') || 'No reason provided';
      const record = db.getTicketByChannel(message.guild.id, message.channel.id);
      if (record) {
        db.updateTicket(message.guild.id, record.id, {
          status: 'closed',
          closedBy: message.author.id,
          closeReason: reason,
          closedAt: Date.now()
        });
      }

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle('🔒 Closing Ticket ' + (info.id || ''))
            .setDescription('Closed by ' + message.author.tag + '\n**Reason:** ' + reason + '\n\nDeleting in 5 seconds.')
        ]
      });

      const logId = settings.ticketLogChannel || settings.logChannel;
      const logChannel = logId ? message.guild.channels.cache.get(logId) : null;
      if (logChannel) {
        logChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.primary)
              .setTitle('Ticket Closed')
              .setDescription(
                '**Ticket:** ' + (info.id || 'unknown') + '\n' +
                '**Owner:** <@' + (info.owner || 'unknown') + '>\n' +
                '**Closed by:** ' + message.author.tag + ' (<@' + message.author.id + '>)\n' +
                '**Reason:** ' + reason
              )
              .setTimestamp()
          ]
        }).catch(function () {});
      }

      setTimeout(function () {
        message.channel.delete('Ticket closed by ' + message.author.tag + ': ' + reason).catch(function () {});
      }, 5000);

      return;
    }

    if (sub === 'claim') {
      if (!staff) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('Only staff can claim tickets.')] });
      }

      if (info.claimed && info.claimed !== 'none') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('⚠️ Already Claimed').setDescription('This ticket is already claimed by <@' + info.claimed + '>.')] });
      }

      await message.channel.setTopic('Ticket ' + (info.id || '#unknown') + ' | owner:' + (info.owner || 'unknown') + ' | claimed:' + message.author.id + ' | type:' + (info.type || 'General Support')).catch(function () {});

      const record = db.getTicketByChannel(message.guild.id, message.channel.id);
      if (record) db.updateTicket(message.guild.id, record.id, { claimedBy: message.author.id });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('🙋 Ticket Claimed')
            .setDescription(message.author + ' is now handling ticket **' + (info.id || '') + '**.')
        ]
      });
    }

    if (sub === 'rename') {
      if (!staff) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('Only staff can rename tickets.')] });
      }

      const newName = args.slice(1).join(' ');
      if (!newName) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing Name').setDescription('Usage: **' + prefix + 'ticket rename payment-issue**')] });
      }

      const renamed = await renameChannel(message.channel, info, newName);
      if (!renamed) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Rename Failed').setDescription('I could not rename this channel. Check my Manage Channels permission.')] });
      }

      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✏️ Ticket Renamed').setDescription('Channel renamed to **' + renamed + '**.')]
      });
    }

    if (sub === 'add' || sub === 'remove') {
      if (!staff) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('Only staff can add or remove users.')] });
      }

      const user = message.mentions.users.first();
      if (!user) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing User').setDescription('Mention the user you want to ' + sub + '.')] });
      }

      const allow = sub === 'add';
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: allow,
        SendMessages: allow,
        ReadMessageHistory: allow,
        AttachFiles: allow
      }).catch(function () {});

      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Ticket Updated').setDescription(user.tag + ' was ' + (allow ? 'added to' : 'removed from') + ' this ticket.')]
      });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Unknown Subcommand').setDescription('Use ' + prefix + 'ticket for the command list.')] });
  },

  async handleInteraction(client, interaction) {
    const settings = db.getGuild(interaction.guild.id);
    const parts = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'create') {
      return interaction.showModal(ticketReasonModal('ticket:reason:create', 'Open a Ticket'));
    }

    if (action === 'custom') {
      const index = parseInt(parts[2], 10);
      const buttons = settings.ticketButtons || [];
      const custom = buttons[index];

      if (!custom) {
        return interaction.reply({ content: 'This ticket button no longer exists.', ephemeral: true });
      }

      return interaction.showModal(ticketReasonModal(
        'ticket:reason:custom:' + index,
        custom.label || 'Open a Ticket'
      ));
    }

    if (action === 'reason') {
      const mode = parts[2];
      let custom = null;
      if (mode === 'custom') {
        const index = parseInt(parts[3], 10);
        custom = (settings.ticketButtons || [])[index] || null;
        if (!custom) {
          return interaction.reply({ content: 'This ticket button no longer exists.', ephemeral: true });
        }
      }

      let reason = '';
      try {
        reason = interaction.fields.getTextInputValue('reason');
      } catch (err) {
        reason = '';
      }

      return createTicket(client, interaction, custom, reason);
    }

    const channel = interaction.channel;

    if (!isTicketChannel(channel)) {
      if (interaction.isButton()) {
        return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
      }
      return;
    }

    const info = parseTopic(channel.topic);
    const staff = isStaff(interaction.member, settings);
    const owner = info.owner === interaction.user.id;

    if (action === 'close') {
      if (!owner && !staff) {
        return interaction.reply({ content: 'Only the ticket owner or staff can close this ticket.', ephemeral: true });
      }

      const record = db.getTicketByChannel(interaction.guild.id, channel.id);
      if (record) {
        db.updateTicket(interaction.guild.id, record.id, {
          status: 'closed',
          closedBy: interaction.user.id,
          closeReason: 'Closed with the ticket button',
          closedAt: Date.now()
        });
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle('🔒 Closing Ticket ' + (info.id || ''))
            .setDescription('Closed by ' + interaction.user.tag + '. Deleting in 5 seconds.')
        ]
      });

      const logId = settings.ticketLogChannel || settings.logChannel;
      const logChannel = logId ? interaction.guild.channels.cache.get(logId) : null;
      if (logChannel) {
        logChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.primary)
              .setTitle('Ticket Closed')
              .setDescription(
                '**Ticket:** ' + (info.id || 'unknown') + '\n' +
                '**Owner:** <@' + (info.owner || 'unknown') + '>\n' +
                '**Closed by:** ' + interaction.user.tag + ' (<@' + interaction.user.id + '>)\n' +
                '**Reason:** Closed with the ticket button'
              )
              .setTimestamp()
          ]
        }).catch(function () {});
      }

      setTimeout(function () {
        channel.delete('Ticket closed by ' + interaction.user.tag).catch(function () {});
      }, 5000);

      return;
    }

    if (action === 'ai' && parts[2] === 'resume') {
      if (!owner && !staff) {
        return interaction.reply({ content: 'Only the ticket owner or staff can change the AI mode.', ephemeral: true });
      }

      const record = db.getTicketByChannel(interaction.guild.id, channel.id);
      if (record) {
        db.updateTicket(interaction.guild.id, record.id, {
          aiPaused: false,
          handledBy: null
        });
      }

      return interaction.reply({
        content: 'AI support is active again. Send your next message and Zyron will reply.',
        ephemeral: true
      });
    }

    if (action === 'claim') {
      if (!staff) {
        return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
      }

      if (info.claimed && info.claimed !== 'none') {
        return interaction.reply({ content: 'This ticket is already claimed by <@' + info.claimed + '>.', ephemeral: true });
      }

      await channel.setTopic('Ticket ' + (info.id || '#unknown') + ' | owner:' + (info.owner || 'unknown') + ' | claimed:' + interaction.user.id + ' | type:' + (info.type || 'General Support')).catch(function () {});

      const record = db.getTicketByChannel(interaction.guild.id, channel.id);
      if (record) db.updateTicket(interaction.guild.id, record.id, { claimedBy: interaction.user.id });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('🙋 Ticket Claimed')
            .setDescription(interaction.user + ' is now handling ticket **' + (info.id || '') + '**.')
        ]
      });
    }

    if (action === 'rename') {
      if (!staff) {
        return interaction.reply({ content: 'Only staff can rename tickets.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket:rename-modal')
        .setTitle('Rename Ticket');

      const input = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('New ticket name')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(70)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'add' || action === 'remove') {
      if (!staff) {
        return interaction.reply({ content: 'Only staff can add or remove users.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket:' + action + '-modal')
        .setTitle(action === 'add' ? 'Add User To Ticket' : 'Remove User From Ticket');

      const input = new TextInputBuilder()
        .setCustomId('user')
        .setLabel('User ID or mention')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(30)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'rename-modal') {
      const newName = interaction.fields.getTextInputValue('name');
      const renamed = await renameChannel(channel, info, newName);

      if (!renamed) {
        return interaction.reply({ content: 'I could not rename this channel.', ephemeral: true });
      }

      return interaction.reply({ content: 'Ticket renamed to **' + renamed + '**.', ephemeral: true });
    }

    if (action === 'add-modal' || action === 'remove-modal') {
      const input = interaction.fields.getTextInputValue('user');
      const userId = input.replace(/[<@!>]/g, '').trim();

      if (!/^\d{15,25}$/.test(userId)) {
        return interaction.reply({ content: 'Give a valid user ID or mention.', ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(userId).catch(function () {
        return null;
      });

      if (!member) {
        return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
      }

      const allow = action === 'add-modal';

      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: allow,
        SendMessages: allow,
        ReadMessageHistory: allow,
        AttachFiles: allow
      }).catch(function () {});

      return interaction.reply({
        content: member.user.tag + ' was ' + (allow ? 'added to' : 'removed from') + ' the ticket.',
        ephemeral: true
      });
    }
  }
};
