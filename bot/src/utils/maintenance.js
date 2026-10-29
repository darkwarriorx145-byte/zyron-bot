const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

const MAINTENANCE_PERMS = [
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.Administrator
];

function isMaintenanceMode(guildId) {
  const guild = db.getGuild(guildId);
  return guild.maintenanceMode === true;
}

function setMaintenanceMode(guildId, enabled, options = {}) {
  const updates = {
    maintenanceMode: enabled,
    maintenanceMessage: options.message || 'The server is currently under maintenance. Please check back later.',
    maintenanceChannelId: options.channelId || null,
    maintenanceAnnouncementChannelId: options.announcementChannelId || null,
    maintenanceAllowedRoles: Array.isArray(options.allowedRoles) ? options.allowedRoles : [],
    maintenanceStartedAt: enabled ? Date.now() : null,
    maintenanceStartedBy: options.startedBy || null
  };
  db.updateGuild(guildId, updates);
  return updates;
}

async function enableMaintenanceMode(guild, settings, startedBy, options = {}) {
  if (settings.maintenanceMode) return { success: false, reason: 'Already in maintenance mode' };

  const overwrites = guild.roles.cache.map(role => ({
    id: role.id,
    deny: [PermissionFlagsBits.ViewChannel]
  }));

  const allowedRoles = options.allowedRoles || [];
  allowedRoles.forEach(roleId => {
    const overwrite = overwrites.find(o => o.id === roleId);
    if (overwrite) {
      overwrite.deny = overwrite.deny.filter(p => p !== PermissionFlagsBits.ViewChannel);
      overwrite.allow = [PermissionFlagsBits.ViewChannel];
    }
  });

  overwrites.push({
    id: guild.client.user.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
  });

  const everyoneRole = guild.roles.everyone;
  const everyoneOverwrite = overwrites.find(o => o.id === everyoneRole.id);
  if (everyoneOverwrite) {
    everyoneOverwrite.deny = [PermissionFlagsBits.ViewChannel];
  }

  let maintenanceChannel = null;
  let announcementChannel = null;

  try {
    maintenanceChannel = await guild.channels.create({
      name: '🔧-maintenance',
      type: ChannelType.GuildText,
      topic: 'Maintenance mode channel - only staff can see this',
      permissionOverwrites: overwrites
    });
  } catch (err) {
    console.error('Failed to create maintenance channel:', err.message);
  }

  try {
    announcementChannel = await guild.channels.create({
      name: '📢-announcements',
      type: ChannelType.GuildText,
      topic: 'Maintenance announcements',
      permissionOverwrites: overwrites
    });
  } catch (err) {
    console.error('Failed to create announcement channel:', err.message);
  }

  if (maintenanceChannel) {
    await maintenanceChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('🔧 Server in Maintenance Mode')
        .setDescription(settings.maintenanceMessage || 'The server is currently under maintenance. Please check back later.')
        .addFields({ name: 'Started by', value: '<@' + startedBy + '>', inline: true })
        .setTimestamp()
      ]
    }).catch(() => {});
  }

  if (announcementChannel) {
    await announcementChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📢 Maintenance Announcements')
        .setDescription('All maintenance updates will be posted here.')
        .setTimestamp()
      ]
    }).catch(() => {});
  }

  const updates = setMaintenanceMode(guild.id, true, {
    message: options.message,
    channelId: maintenanceChannel?.id || null,
    announcementChannelId: announcementChannel?.id || null,
    allowedRoles: allowedRoles,
    startedBy: startedBy
  });

  for (const [_, channel] of guild.channels.cache) {
    if (channel.id === maintenanceChannel?.id || channel.id === announcementChannel?.id) continue;
    try {
      await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false }, 'Maintenance mode');
    } catch (err) {
      console.error('Failed to hide channel ' + channel.name + ':', err.message);
    }
  }

  return { success: true, maintenanceChannel, announcementChannel };
}

async function disableMaintenanceMode(guild, settings) {
  if (!settings.maintenanceMode) return { success: false, reason: 'Not in maintenance mode' };

  const everyoneRole = guild.roles.everyone;

  for (const [_, channel] of guild.channels.cache) {
    if (channel.id === settings.maintenanceChannelId || channel.id === settings.maintenanceAnnouncementChannelId) continue;
    try {
      await channel.permissionOverwrites.delete(everyoneRole, 'Maintenance mode ended');
    } catch (err) {
      console.error('Failed to restore channel ' + channel.name + ':', err.message);
    }
  }

  if (settings.maintenanceChannelId) {
    const ch = guild.channels.cache.get(settings.maintenanceChannelId);
    if (ch) await ch.delete('Maintenance mode ended').catch(() => {});
  }
  if (settings.maintenanceAnnouncementChannelId) {
    const ch = guild.channels.cache.get(settings.maintenanceAnnouncementChannelId);
    if (ch) await ch.delete('Maintenance mode ended').catch(() => {});
  }

  setMaintenanceMode(guild.id, false);
  return { success: true };
}

async function sendMaintenanceAnnouncement(guild, settings, message, authorId) {
  if (!settings.maintenanceAnnouncementChannelId) return false;
  const channel = guild.channels.cache.get(settings.maintenanceAnnouncementChannelId);
  if (!channel) return false;

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📢 Maintenance Update')
      .setDescription(message)
      .setFooter({ text: 'Update by <@' + authorId + '> | ' + config.botName })
      .setTimestamp()
    ]
  }).catch(() => {});
  return true;
}

module.exports = {
  isMaintenanceMode,
  setMaintenanceMode,
  enableMaintenanceMode,
  disableMaintenanceMode,
  sendMaintenanceAnnouncement,
  MAINTENANCE_PERMS
};