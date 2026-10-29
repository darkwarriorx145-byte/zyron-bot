const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

const BANNED_NICK_PATTERNS = [
  /@everyone|@here/,
  /discord\.gg\//i,
  /https?:\/\//i,
  /<@[!&]?\d+>/,
];

function checkBannedNickname(nickname) {
  for (const pattern of BANNED_NICK_PATTERNS) {
    if (pattern.test(nickname)) return pattern;
  }
  return null;
}

async function setNickname(member, nickname, reason, executor) {
  const banned = checkBannedNickname(nickname);
  if (banned) {
    return { success: false, reason: 'Nickname contains banned content (' + banned + ').' };
  }

  const cleanNick = String(nickname || '').slice(0, 32);
  const oldNick = member.nickname || member.user.username;

  try {
    await member.setNickname(cleanNick || null, reason);
    return { success: true, oldNick, newNick: cleanNick || member.user.username };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function resetNickname(member, reason, executor) {
  try {
    await member.setNickname(null, reason);
    return { success: true, oldNick: member.nickname || member.user.username, newNick: member.user.username };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

function getBannedNickPatterns(guildId) {
  const guild = db.getGuild(guildId);
  return guild.bannedNickPatterns || [...BANNED_NICK_PATTERNS.map(p => p.source)];
}

function setBannedNickPatterns(guildId, patterns) {
  const valid = patterns.filter(p => {
    try { new RegExp(p); return true; } catch { return false; }
  });
  db.updateGuild(guildId, { bannedNickPatterns: valid });
  return valid;
}

async function autoFixNicknames(guild) {
  const settings = db.getGuild(guild.id);
  const patterns = getBannedNickPatterns(guild.id);
  const regexes = patterns.map(p => new RegExp(p));
  let fixed = 0;

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const nick = member.nickname || '';
    if (!nick) continue;

    for (const regex of regexes) {
      if (regex.test(nick)) {
        const result = await resetNickname(member, 'Auto-removed banned nickname pattern', guild.client.user.id);
        if (result.success) fixed++;
        break;
      }
    }
  }
  return fixed;
}

async function sendNicknameDM(member, oldNick, newNick, reason, executor) {
  try {
    const { EmbedBuilder } = require('discord.js');
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('Nickname Changed')
        .setDescription('Your nickname in **' + member.guild.name + '** was changed.')
        .addFields(
          { name: 'Old', value: oldNick || '(none)', inline: true },
          { name: 'New', value: newNick || '(reset to username)', inline: true },
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: config.botName + ' | Powered by ' + config.company })
        .setTimestamp()
      ]
    }).catch(() => {});
  } catch (err) {
    console.error('Nickname DM failed:', err.message);
  }
}

module.exports = {
  setNickname,
  resetNickname,
  checkBannedNickname,
  getBannedNickPatterns,
  setBannedNickPatterns,
  autoFixNicknames,
  sendNicknameDM,
  BANNED_NICK_PATTERNS
};