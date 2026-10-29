const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const tempActions = require('../utils/tempActions');
const protection = require('../utils/protection');
const staffTracker = require('../utils/staffTracker');
const notifications = require('../utils/notifications');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
  name: 'tempban',
  aliases: ['tban'],
  description: 'Temporarily ban a member. Zyron unbans them automatically when the timer ends.',
  permissions: [PermissionsBitField.Flags.BanMembers],
  usage: '<@user> <duration> <reason> | list | cancel <id>',
  subcommands: [
    { name: '<@user> <duration> <reason>', description: 'Temporarily ban a member, e.g. 7d.' },
    { name: 'list', description: 'List active temporary actions (Manage Server).', admin: true },
    { name: 'cancel <id>', description: 'Cancel a scheduled action (Manage Server).', admin: true }
  ],

  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'list') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to view scheduled actions.')] });
      }
      const actions = tempActions.listActions(message.guild.id);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('⏰ Scheduled Moderation')
          .setDescription(actions.length > 0
            ? actions.map(function (action) {
                return '`' + action.id + '` • **' + action.type + '** • <@' + action.userId + '> • <t:' + Math.floor(action.expiresAt / 1000) + ':R>\n' +
                  'Reason: ' + action.reason;
              }).join('\n\n')
            : 'No active temporary actions.')
          .setFooter({ text: config.botName + ' Scheduled Moderation' })
          .setTimestamp()]
      });
    }

    if (sub === 'cancel') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to cancel scheduled actions.')] });
      }
      const removed = tempActions.removeAction(message.guild.id, args[1]);
      if (!removed) return message.reply({ embeds: [ZyronEmbedBuilder.error('Not Found', 'Use ' + prefix + 'tempban list to see IDs.')] });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Action Cancelled', 'The scheduled action was removed. The current punishment stays in place.')] });
    }

    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const durationInput = args[1];
    const reason = args.slice(2).join(' ').trim();

    if (!target) return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a member or give their user ID.')] });
    if (!durationInput) return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Duration', 'Example: ' + prefix + 'tempban @user 7d spamming')] });
    if (!reason) return message.reply({ embeds: [ZyronEmbedBuilder.error('Reason Required', 'Give a reason for the temporary ban.')] });

    const durationMs = tempActions.parseDuration(durationInput);
    if (!durationMs || durationMs < 60000) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Duration', 'Use at least 1 minute, e.g. 30m, 12h, 7d.')] });
    }

    if (protection.isProtectedUser(target.id)) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Protected User', 'The main owner and main admin cannot be banned.')] });
    }
    if (target.id === message.author.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Self Ban', 'You cannot ban yourself.')] });
    }
    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot ban a member with equal or higher role hierarchy.')] });
    }
    if (!target.bannable) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'I cannot ban this member. Check my role position.')] });
    }

    try {
      await target.ban({ reason: reason + ' | Temporary ban by ' + message.author.tag, deleteMessageSeconds: 0 });
      const expiresAt = Date.now() + durationMs;
      tempActions.addAction(message.guild.id, {
        type: 'ban',
        userId: target.id,
        moderatorId: message.author.id,
        reason: reason,
        expiresAt: expiresAt
      });

      staffTracker.logStaffAction(message.guild.id, message.author.id, 'tempban', {
        target: target.id,
        reason: reason,
        duration: durationInput
      });
      notifications.dmSecurityAction(target, {
        action: 'Temporary Ban',
        reason: reason,
        duration: tempActions.formatDuration(durationMs)
      }).catch(function () {});

      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.warning)
          .setTitle('⏳ Temporary Ban')
          .setDescription(
            '**User:** ' + target.user.tag + ' (<@' + target.id + '>)\n' +
            '**Moderator:** <@' + message.author.id + '>\n' +
            '**Duration:** ' + tempActions.formatDuration(durationMs) + '\n' +
            '**Expires:** <t:' + Math.floor(expiresAt / 1000) + ':F> (<t:' + Math.floor(expiresAt / 1000) + ':R>)\n' +
            '**Reason:** ' + reason
          )
          .setFooter({ text: config.botName + ' Scheduled Moderation' })
          .setTimestamp()]
      });
    } catch (err) {
      console.error('Tempban failed:', err.message);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Ban Failed', 'Discord rejected the ban: ' + err.message)] });
    }
  }
};
