const { ChannelType } = require('discord.js');
const db = require('../database/db');

function snapshot(channel) {
  const overwrites = [];

  channel.permissionOverwrites.cache.forEach(function (overwrite) {
    overwrites.push({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString()
    });
  });

  return {
    name: channel.name,
    type: channel.type,
    topic: channel.topic || null,
    nsfw: channel.nsfw || false,
    position: channel.rawPosition || 0,
    parentId: channel.parentId || null,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    userLimit: channel.userLimit || 0,
    bitrate: channel.bitrate || 64000,
    overwrites: overwrites
  };
}

function saveChannel(guildId, channel) {
  if (!channel || !channel.guild) return;
  db.setChannelBackup(guildId, channel.id, snapshot(channel));
}

function backupGuild(guild) {
  guild.channels.cache.forEach(function (channel) {
    saveChannel(guild.id, channel);
  });
}

async function restore(guild, data) {
  if (!data || !data.name) return null;

  const overwrites = (data.overwrites || []).filter(function (overwrite) {
    if (overwrite.id === guild.id) return true;
    if (guild.roles.cache.has(overwrite.id)) return true;
    if (guild.members.cache.has(overwrite.id)) return true;
    return false;
  }).map(function (overwrite) {
    return {
      id: overwrite.id,
      type: overwrite.type,
      allow: BigInt(overwrite.allow || '0'),
      deny: BigInt(overwrite.deny || '0')
    };
  });

  const options = {
    name: data.name,
    type: data.type,
    permissionOverwrites: overwrites,
    reason: 'Zyron Anti-Nuke: restoring deleted channel.'
  };

  if (data.type !== ChannelType.GuildCategory) {
    const parent = data.parentId ? guild.channels.cache.get(data.parentId) : null;
    if (parent) options.parent = parent.id;
  }

  if (data.type === ChannelType.GuildText || data.type === ChannelType.GuildAnnouncement) {
    options.topic = data.topic || null;
    options.nsfw = data.nsfw || false;
    options.rateLimitPerUser = data.rateLimitPerUser || 0;
  }

  if (data.type === ChannelType.GuildVoice || data.type === ChannelType.GuildStageVoice) {
    options.userLimit = data.userLimit || 0;
    options.bitrate = data.bitrate || 64000;
  }

  if (data.position) options.position = data.position;

  const channel = await guild.channels.create(options).catch(function (err) {
    console.error('Could not restore channel ' + data.name + ': ' + err.message);
    return null;
  });

  if (channel) {
    db.removeChannelBackup(guild.id, data.oldId || channel.id);
    db.setChannelBackup(guild.id, channel.id, snapshot(channel));
  }

  return channel;
}

async function recoverGuild(guild) {
  const backups = db.getChannelBackups(guild.id);
  const missing = [];

  for (const id in backups) {
    if (!guild.channels.cache.has(id)) {
      const data = Object.assign({}, backups[id], { oldId: id });
      missing.push(data);
    }
  }

  missing.sort(function (a, b) {
    if (a.type === ChannelType.GuildCategory && b.type !== ChannelType.GuildCategory) return -1;
    if (b.type === ChannelType.GuildCategory && a.type !== ChannelType.GuildCategory) return 1;
    return (a.position || 0) - (b.position || 0);
  });

  let restored = 0;

  for (const data of missing) {
    const channel = await restore(guild, data);
    if (channel) restored++;
  }

  return restored;
}

module.exports = {
  snapshot: snapshot,
  saveChannel: saveChannel,
  backupGuild: backupGuild,
  restore: restore,
  recoverGuild: recoverGuild
};
