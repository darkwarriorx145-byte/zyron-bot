const {
  PermissionsBitField,
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

function staffRoleIds(settings) {
  return ticketAssistant.roleIds(settings);
}

function ticketStats(guildId) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const stats = {};
  db.getTickets(guildId).forEach(function (ticket) {
    if (ticket.status !== 'closed' || !ticket.closedBy) return;
    if ((ticket.closedAt || 0) < cutoff) return;
    if (!stats[ticket.closedBy]) stats[ticket.closedBy] = 0;
    stats[ticket.closedBy]++;
  });
  return stats;
}

function adviceEmbed(guild, settings) {
  const stats = ticketStats(guild.id);
  const members = [];
  const roleIds = staffRoleIds(settings);

  guild.members.cache.forEach(function (member) {
    if (member.user.bot) return;
    const hasRole = roleIds.some(function (roleId) {
      return member.roles.cache.has(roleId);
    });
    if (hasRole) members.push(member);
  });

  const ranked = members.map(function (member) {
    return { member: member, closes: stats[member.id] || 0 };
  }).sort(function (a, b) {
    return b.closes - a.closes;
  }).slice(0, 5);

  if (ranked.length === 0) {
    return new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('Staff Advice')
      .setDescription('No staff roles or staff members were found. Add staff roles in the dashboard first.')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company });
  }

  const lines = ranked.map(function (entry) {
    let action = 'keep';
    let reason = 'they are active and helping members';
    if (entry.closes >= 3) {
      action = 'promote';
      reason = 'they closed ' + entry.closes + ' tickets in the last 30 days';
    } else if (entry.closes === 0) {
      action = 'demote';
      reason = 'they have not closed a ticket in the last 30 days';
    }
    return '**Advice** - <@' + entry.member.id + '>, you can **' + action + '** this staff because ' +
      reason + '. | Closed: **' + entry.closes + '**';
  });

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('Staff Performance Advice')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();
}

function adviceRows(guild, settings) {
  const stats = ticketStats(guild.id);
  const roleIds = staffRoleIds(settings);
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  guild.members.cache.forEach(function (member) {
    if (count >= 5 || member.user.bot) return;
    const hasRole = roleIds.some(function (roleId) {
      return member.roles.cache.has(roleId);
    });
    if (!hasRole) return;

    const closes = stats[member.id] || 0;
    const prefix = 'staffadvice:' + (closes === 0 ? 'demote' : 'promote') + ':' + member.id;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(prefix)
        .setLabel((closes === 0 ? 'Demote ' : 'Promote ') + member.user.username)
        .setStyle(closes === 0 ? ButtonStyle.Secondary : ButtonStyle.Success)
    );
    count++;
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  });

  if (row.components.length > 0) rows.push(row);
  return rows.slice(0, 5);
}

module.exports = {
  name: 'staffreview',
  aliases: ['staffadvice'],
  description: 'Review staff ticket activity and post promote/demote advice.',
  permissions: [P.ManageGuild],
  usage: '',
  async execute(client, message) {
    const settings = db.getGuild(message.guild.id);
    const channel = (settings.logChannel && message.guild.channels.cache.get(settings.logChannel)) || message.channel;
    await channel.send({
      embeds: [adviceEmbed(message.guild, settings)],
      components: adviceRows(message.guild, settings)
    });
    if (channel.id !== message.channel.id) {
      await message.reply({ content: 'Staff advice posted in ' + channel + '.' });
    }
  },

  async handleInteraction(client, interaction) {
    if (!interaction.member || !interaction.member.permissions.has(P.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server to change staff roles.', ephemeral: true });
    }

    const parts = interaction.customId.split(':');
    const action = parts[1];
    const userId = parts[2];

    if (action === 'promote' || action === 'demote') {
      const modal = new ModalBuilder()
        .setCustomId('staffadvice:apply:' + action + ':' + userId)
        .setTitle(action === 'promote' ? 'Promote Staff' : 'Demote Staff');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('roleId')
            .setLabel('Role ID to ' + (action === 'promote' ? 'give' : 'remove'))
            .setStyle(TextInputStyle.Short)
            .setMaxLength(25)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    if (action === 'apply') {
      const mode = parts[2];
      const targetId = parts[3];
      const roleId = String(interaction.fields.getTextInputValue('roleId') || '').replace(/[<@&>]/g, '').trim();

      if (!/^\d{15,25}$/.test(roleId)) {
        return interaction.reply({ content: 'Give a valid role ID.', ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(targetId).catch(function () {
        return null;
      });
      const role = interaction.guild.roles.cache.get(roleId) ||
        await interaction.guild.roles.fetch(roleId).catch(function () {
          return null;
        });

      if (!member || !role) {
        return interaction.reply({ content: 'That member or role was not found.', ephemeral: true });
      }

      if (mode === 'promote') {
        await member.roles.add(role, 'Staff performance review: promoted by ' + interaction.user.tag).catch(function () {});
      } else {
        await member.roles.remove(role, 'Staff performance review: demoted by ' + interaction.user.tag).catch(function () {});
      }

      const settings = db.getGuild(interaction.guild.id);
      const channel = (settings.logChannel && interaction.guild.channels.cache.get(settings.logChannel)) || interaction.channel;
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(mode === 'promote' ? config.colors.success : config.colors.warning)
            .setTitle(mode === 'promote' ? 'Staff Promoted' : 'Staff Demoted')
            .setDescription(
              (mode === 'promote' ? 'Promoted ' : 'Demoted ') + member +
              ' with ' + role + '.\n\n' +
              (mode === 'promote' ? 'Well done! Keep helping the community.' : 'They can improve and be reviewed again later.')
            )
            .setFooter({ text: config.botName + ' | Powered by ' + config.company })
            .setTimestamp()
        ]
      }).catch(function () {});

      return interaction.reply({
        content: (mode === 'promote' ? 'Promoted ' : 'Demoted ') + member.user.tag + '.',
        ephemeral: true
      });
    }
  }
};
