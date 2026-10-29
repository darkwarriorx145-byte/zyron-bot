const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function getInviteStats(guildId, userId) {
  if (!db.data.invites[guildId]) return { total: 0, real: 0, fake: 0, left: 0, rejoined: 0, bonus: 0, codes: {} };
  if (!db.data.invites[guildId][userId]) {
    db.data.invites[guildId][userId] = { total: 0, real: 0, fake: 0, left: 0, rejoined: 0, bonus: 0, codes: {} };
  }
  return db.data.invites[guildId][userId];
}

function addInvite(guildId, userId, field, amount = 1) {
  const stats = getInviteStats(guildId, userId);
  if (stats[field] === undefined) stats[field] = 0;
  stats[field] += amount;
  if (stats[field] < 0) stats[field] = 0;
  db.save();
  return stats;
}

function trackInviteCode(guildId, inviterId, code, action) {
  const stats = getInviteStats(guildId, inviterId);
  if (!stats.codes[code]) {
    stats.codes[code] = { uses: 0, createdAt: Date.now(), active: true };
  }
  if (action === 'create') {
    stats.codes[code].active = true;
  } else if (action === 'delete') {
    stats.codes[code].active = false;
  } else if (action === 'use') {
    stats.codes[code].uses = (stats.codes[code].uses || 0) + 1;
  }
  db.save();
}

function getInviteCodeStats(guildId, inviterId, code) {
  const stats = getInviteStats(guildId, inviterId);
  return stats.codes[code] || null;
}

function getInviteLeaderboard(guildId, field = 'total', limit = 10) {
  const guild = db.data.invites[guildId] || {};
  const list = [];
  for (const userId in guild) {
    const stats = guild[userId];
    list.push({ userId, amount: stats[field] || 0, stats });
  }
  list.sort((a, b) => b.amount - a.amount);
  return list.slice(0, limit);
}

function getInviteCodeLeaderboard(guildId, limit = 10) {
  const guild = db.data.invites[guildId] || {};
  const codes = [];
  for (const userId in guild) {
    const stats = guild[userId];
    for (const code in stats.codes || {}) {
      const c = stats.codes[code];
      if (c.active) codes.push({ code, inviterId: userId, uses: c.uses || 0, createdAt: c.createdAt });
    }
  }
  codes.sort((a, b) => b.uses - a.uses);
  return codes.slice(0, limit);
}

function setInviteRecord(guildId, memberId, record) {
  if (!db.data.inviteMembers[guildId]) db.data.inviteMembers[guildId] = {};
  db.data.inviteMembers[guildId][memberId] = record;
  db.save();
}

function getInviteRecord(guildId, memberId) {
  if (!db.data.inviteMembers[guildId]) return null;
  return db.data.inviteMembers[guildId][memberId] || null;
}

function isInviteCounted(record) {
  if (!record) return false;
  if (record.counted === true) return true;
  // Records created before verified-invite tracking were counted on join.
  return record.counted === undefined && record.verified === undefined;
}

async function countVerifiedInvite(guild, member, settings) {
  const record = getInviteRecord(guild.id, member.id);
  if (!record || !record.inviter) return null;

  const alreadyCounted = isInviteCounted(record);

  if (!record.verified) {
    record.verified = true;
    record.verifiedAt = Date.now();
    setInviteRecord(guild.id, member.id, record);
  }

  if (alreadyCounted) {
    return { counted: false, alreadyCounted: true, inviter: record.inviter };
  }

  const isFake = record.isFake === true;
  const inviterId = record.inviter;

  addInvite(guild.id, inviterId, 'total', 1);
  addInvite(guild.id, inviterId, isFake ? 'fake' : 'real', 1);

  const reward = Number(settings.economyInvite) > 0 ? Number(settings.economyInvite) : 0;
  if (!isFake && reward > 0) {
    db.addCoins(guild.id, inviterId, reward);
  }

  record.counted = true;
  record.countedAt = Date.now();
  setInviteRecord(guild.id, member.id, record);

  const logId = settings.inviteLogChannel || settings.logChannel;
  const logChannel = logId ? guild.channels.cache.get(logId) : null;
  if (logChannel) {
    logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Invite Counted')
        .setDescription(
          '**Member:** ' + member.user.tag + ' (<@' + member.id + '>)\n' +
          '**Inviter:** <@' + inviterId + '>\n' +
          '**Invite:** ' + (record.code || 'unknown') + '\n' +
          '**Type:** ' + (isFake ? 'Fake (new account)' : 'Real') + '\n' +
          '**Reward:** ' + (isFake ? 'No coins (fake account)' : (reward > 0 ? reward + ' coins' : 'Disabled')) + '\n' +
          '**Counted after verification.**'
        )
        .setTimestamp()]
    }).catch(function () {});
  }

  return { counted: true, inviter: inviterId, isFake: isFake, reward: reward, code: record.code || null };
}

function resetInvites(guildId, userId = null) {
  if (userId) {
    db.data.invites[guildId][userId] = { total: 0, real: 0, fake: 0, left: 0, rejoined: 0, bonus: 0, codes: {} };
  } else {
    db.data.invites[guildId] = {};
  }
  db.save();
}

async function sendInviteLog(guild, settings, data) {
  const logId = settings.inviteLogChannel || settings.logChannel;
  const logChannel = logId ? guild.channels.cache.get(logId) : null;
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(data.type === 'join' ? config.colors.success : config.colors.warning)
    .setTitle(data.type === 'join' ? '📥 Member Joined' : '📤 Member Left')
    .setDescription(
      '**Member:** ' + data.member.tag + ' (<@' + data.member.id + '>)\n' +
      '**Inviter:** <@' + data.inviterId + '>\n' +
      '**Invite Code:** ' + data.code + '\n' +
      '**Account Age:** ' + Math.floor((Date.now() - data.member.user.createdTimestamp) / 86400000) + ' days\n' +
      '**Type:** ' + (data.fake ? '⚠️ Fake (new account)' : '✅ Real')
    )
    .setThumbnail(data.member.user.displayAvatarURL())
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function sendInviteLeaderboardDM(user, guild, leaderboard) {
  try {
    const { EmbedBuilder } = require('discord.js');
    const lines = leaderboard.map((entry, i) => 
      '**' + (i + 1) + '.** <@' + entry.userId + '> — **' + entry.amount + '** invites'
    ).join('\n');
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🏆 Invite Leaderboard — ' + guild.name)
        .setDescription(lines || 'No data')
        .setFooter({ text: config.botName + ' | Powered by ' + config.company })
        .setTimestamp()
      ]
    }).catch(() => {});
  } catch (err) {
    console.error('Invite leaderboard DM failed:', err.message);
  }
}

module.exports = {
  getInviteStats,
  addInvite,
  trackInviteCode,
  getInviteCodeStats,
  getInviteLeaderboard,
  getInviteCodeLeaderboard,
  setInviteRecord,
  getInviteRecord,
  isInviteCounted,
  countVerifiedInvite,
  resetInvites,
  sendInviteLog,
  sendInviteLeaderboardDM
};