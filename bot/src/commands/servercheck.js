const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const serverAudit = require('../utils/serverAudit');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
  name: 'servercheck',
  aliases: ['audit', 'health'],
  description: 'Audit dangerous roles, channel overwrites, bots, webhooks and server settings.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<run|status|enable|disable|interval|channel>',
  subcommands: [
    { name: 'run', description: 'Run a full server health check now.' },
    { name: 'status', description: 'Show the latest saved report.' },
    { name: 'enable', description: 'Enable automatic scheduled checks.' },
    { name: 'disable', description: 'Disable automatic scheduled checks.' },
    { name: 'interval <hours>', description: 'Set how often automatic checks run.' },
    { name: 'channel [#channel]', description: 'Set where reports are posted.' }
  ],

  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || 'run').toLowerCase();

    if (sub === 'run' || sub === 'check') {
      try {
        const report = await serverAudit.runAndStore(message.guild, settings, false);
        const channelId = settings.serverAuditChannelId || settings.logChannel;
        if (channelId) {
          const channel = message.guild.channels.cache.get(channelId);
          if (channel) channel.send({ embeds: [serverAudit.buildEmbed(report)] }).catch(function () {});
        }
        return message.reply({ embeds: [serverAudit.buildEmbed(report)] });
      } catch (err) {
        console.error('Server audit failed:', err.message);
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Audit Failed', err.message)] });
      }
    }

    if (sub === 'status') {
      const report = settings.serverAuditReport;
      if (!report) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('No Report Yet', 'Run ' + prefix + 'servercheck run to create one.')] });
      }
      return message.reply({ embeds: [serverAudit.buildEmbed(report)] });
    }

    if (sub === 'enable' || sub === 'disable') {
      const enabled = sub === 'enable';
      db.updateGuild(message.guild.id, {
        serverAuditEnabled: enabled,
        serverAuditLastAt: enabled ? Date.now() : null
      });
      return message.reply({ embeds: [ZyronEmbedBuilder.success(enabled ? 'Automatic Checks Enabled' : 'Automatic Checks Disabled',
        enabled
          ? 'Zyron will audit the server every **' + (settings.serverAuditIntervalHours || 24) + '** hours.'
          : 'Scheduled audits are paused.')] });
    }

    if (sub === 'interval') {
      const hours = parseInt(args[1], 10);
      if (isNaN(hours) || hours < 1 || hours > 720) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Interval', 'Give a number of hours between 1 and 720.')] });
      }
      db.updateGuild(message.guild.id, { serverAuditIntervalHours: hours, serverAuditLastAt: Date.now() });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Interval Updated', 'Automatic checks will run every **' + hours + '** hours.')] });
    }

    if (sub === 'channel') {
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!channel || !channel.isTextBased()) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Channel', 'Mention a text channel.')] });
      }
      db.updateGuild(message.guild.id, { serverAuditChannelId: channel.id });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Report Channel Set', 'Health reports will post in <#' + channel.id + '>.')] });
    }

    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🩺 Server Check')
        .setDescription(
          '**Status:** ' + (settings.serverAuditEnabled ? 'Automatic checks on' : 'Automatic checks off') + '\n' +
          '**Interval:** every ' + (settings.serverAuditIntervalHours || 24) + ' hours\n' +
          '**Channel:** ' + (settings.serverAuditChannelId ? '<#' + settings.serverAuditChannelId + '>' : '*not set*') + '\n' +
          '**Last run:** ' + (settings.serverAuditLastAt ? '<t:' + Math.floor(settings.serverAuditLastAt / 1000) + ':R>' : '*never*') + '\n\n' +
          '**Commands**\n' +
          prefix + 'servercheck run\n' +
          prefix + 'servercheck status\n' +
          prefix + 'servercheck enable / disable\n' +
          prefix + 'servercheck interval <hours>\n' +
          prefix + 'servercheck channel #channel'
        )
        .setFooter({ text: config.botName + ' Server Health' })
        .setTimestamp()]
    });
  }
};
