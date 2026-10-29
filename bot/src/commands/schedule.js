const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const scheduler = require('../utils/scheduler');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
  name: 'schedule',
  aliases: ['scheduled', 'announce'],
  description: 'Schedule announcements with optional daily or weekly repeats.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<add|list|remove>',
  subcommands: [
    { name: 'add <#channel> <when> <message>', description: 'Schedule a message. When: 30m, 2h, 1d or 1d:daily.' },
    { name: 'list', description: 'List scheduled announcements.' },
    { name: 'remove <id>', description: 'Remove a scheduled announcement.' }
  ],

  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'add' || sub === 'create') {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!channel || !channel.isTextBased()) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Channel', 'Mention the text channel for the announcement.')] });
      }
      const when = args[2];
      const text = args.slice(3).join(' ').trim();
      if (!when || !text) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Usage', 'Use ' + prefix + 'schedule add #channel 2h Your message')] });
      }
      try {
        const schedule = scheduler.addSchedule(message.guild.id, {
          channelId: channel.id,
          message: text,
          when: when,
          createdBy: message.author.id
        });
        return message.reply({
          embeds: [ZyronEmbedBuilder.success('Announcement Scheduled',
            '**Channel:** <#' + channel.id + '>\n' +
            '**Runs:** <t:' + Math.floor(schedule.runAt / 1000) + ':F> (<t:' + Math.floor(schedule.runAt / 1000) + ':R>)\n' +
            '**Repeat:** ' + schedule.repeat + '\n' +
            '**ID:** `' + schedule.id + '`')]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Could Not Schedule', err.message)] });
      }
    }

    if (sub === 'list' || !sub) {
      const schedules = scheduler.listSchedules(message.guild.id);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📣 Scheduled Announcements')
          .setDescription(schedules.length > 0
            ? schedules.map(function (schedule) {
                return '`' + schedule.id + '` • <#' + schedule.channelId + '> • <t:' + Math.floor(schedule.runAt / 1000) + ':R>' +
                  (schedule.repeat !== 'none' ? ' • ' + schedule.repeat : '') + '\n' +
                  schedule.message.slice(0, 120);
              }).join('\n\n')
            : 'Nothing scheduled yet.')
          .setFooter({ text: 'Add one with ' + prefix + 'schedule add #channel 2h message' })
          .setTimestamp()]
      });
    }

    if (sub === 'remove' || sub === 'delete' || sub === 'cancel') {
      const removed = scheduler.removeSchedule(message.guild.id, args[1]);
      if (!removed) return message.reply({ embeds: [ZyronEmbedBuilder.error('Not Found', 'Use ' + prefix + 'schedule list to see IDs.')] });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Schedule Removed', 'The announcement will not be sent.')] });
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'schedule add|list|remove.')] });
  }
};
