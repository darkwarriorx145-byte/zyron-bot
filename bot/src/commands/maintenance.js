const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const db = require('../database/db');
const maintenance = require('../utils/maintenance');
const staffTracker = require('../utils/staffTracker');
const config = require('../../config.json');

function rolesFromMentions(message, fallback) {
  const mentioned = message.mentions.roles.map(function (role) { return role.id; });
  if (mentioned.length > 0) return mentioned;
  return Array.isArray(fallback) ? fallback : [];
}

module.exports = {
  name: 'maintenance',
  aliases: ['maint'],
  description: 'Enable, disable or announce maintenance mode without the dashboard.',
  permissions: [PermissionsBitField.Flags.Administrator],
  usage: '<on [message] | off | status | announce <message> | roles @role...>',
  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
      const allowedRoles = (settings.maintenanceAllowedRoles || []).map(function (id) {
        return '<@&' + id + '>';
      }).join(', ') || 'None';

      return message.reply({
        embeds: [ZyronEmbedBuilder.info(
          'Maintenance Status',
          '**Enabled:** ' + (settings.maintenanceMode ? 'Yes' : 'No') + '\n' +
          '**Message:** ' + (settings.maintenanceMessage || 'Not set') + '\n' +
          '**Maintenance channel:** ' + (settings.maintenanceChannelId ? '<#' + settings.maintenanceChannelId + '>' : 'None') + '\n' +
          '**Announcement channel:** ' + (settings.maintenanceAnnouncementChannelId ? '<#' + settings.maintenanceAnnouncementChannelId + '>' : 'None') + '\n' +
          '**Allowed roles:** ' + allowedRoles + '\n' +
          '**Started by:** ' + (settings.maintenanceStartedBy ? '<@' + settings.maintenanceStartedBy + '>' : '—')
        )]
      });
    }

    if (sub === 'on' || sub === 'enable' || sub === 'start') {
      if (settings.maintenanceMode) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.warning('Already Enabled', 'Maintenance mode is already active. Use `' + prefix + 'maintenance off` to restore the server.')]
        });
      }

      const text = args.slice(1).join(' ').trim() || settings.maintenanceMessage;
      const allowedRoles = rolesFromMentions(message, settings.maintenanceAllowedRoles);

      await message.reply({
        embeds: [ZyronEmbedBuilder.warning('Maintenance Starting', 'Hiding every channel, then creating the maintenance and announcement channels.')]
      }).catch(function () {});

      const result = await maintenance.enableMaintenanceMode(message.guild, settings, message.author.id, {
        message: text,
        allowedRoles: allowedRoles
      });

      if (!result.success) {
        return message.channel.send({
          embeds: [ZyronEmbedBuilder.error('Maintenance Failed', result.reason || 'Could not enable maintenance mode.')]
        }).catch(function () {});
      }

      staffTracker.logStaffAction(message.guild.id, message.author.id, 'maintenance_on', {
        message: text,
        allowedRoles: allowedRoles
      });

      return;
    }

    if (sub === 'off' || sub === 'disable' || sub === 'stop') {
      if (!settings.maintenanceMode) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.warning('Not Enabled', 'Maintenance mode is not active right now.')]
        });
      }

      await message.reply({
        embeds: [ZyronEmbedBuilder.info('Maintenance Ending', 'Restoring channel permissions and removing the maintenance channels.')]
      }).catch(function () {});

      const result = await maintenance.disableMaintenanceMode(message.guild, settings);

      if (!result.success) {
        return message.channel.send({
          embeds: [ZyronEmbedBuilder.error('Restore Failed', result.reason || 'Could not disable maintenance mode.')]
        }).catch(function () {});
      }

      staffTracker.logStaffAction(message.guild.id, message.author.id, 'maintenance_off', {});
      return;
    }

    if (sub === 'announce' || sub === 'update') {
      const text = args.slice(1).join(' ').trim();
      if (!text) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Missing Message', 'Usage: `' + prefix + 'maintenance announce Server will be back in 30 minutes.`')]
        });
      }

      const sent = await maintenance.sendMaintenanceAnnouncement(message.guild, settings, text, message.author.id);
      if (!sent) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('No Announcement Channel', 'Enable maintenance mode first, or set the announcement channel in the dashboard Modules tab.')]
        });
      }

      staffTracker.logStaffAction(message.guild.id, message.author.id, 'maintenance_announce', { message: text });
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Announcement Sent', 'The maintenance update was posted.')]
      }).catch(function () {});
    }

    if (sub === 'roles') {
      const roles = message.mentions.roles.map(function (role) { return role.id; });
      if (roles.length === 0) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Missing Roles', 'Usage: `' + prefix + 'maintenance roles @Staff @Moderator`')]
        });
      }

      db.updateGuild(message.guild.id, { maintenanceAllowedRoles: roles });
      return message.reply({
        embeds: [ZyronEmbedBuilder.success(
          'Allowed Roles Updated',
          'These roles can still view the server during maintenance:\n' + roles.map(function (id) { return '<@&' + id + '>'; }).join(', ')
        )]
      });
    }

    return message.reply({
      embeds: [ZyronEmbedBuilder.error(
        'Unknown Subcommand',
        'Usage:\n`' + prefix + 'maintenance on [message]`\n`' + prefix + 'maintenance off`\n`' + prefix + 'maintenance status`\n`' + prefix + 'maintenance announce <message>`\n`' + prefix + 'maintenance roles @role...`'
      )]
    });
  }
};
