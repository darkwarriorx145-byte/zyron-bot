const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const progression = require('./progression');
const staffTracker = require('./staffTracker');

const messageCooldowns = new Map();
let voiceTimer = null;

function guildLevels(guildId) {
  if (!db.data.levels[guildId]) db.data.levels[guildId] = {};
  return db.data.levels[guildId];
}

function emptyUser() {
  return {
    totalXp: 0,
    level: 0,
    messages: 0,
    voiceMinutes: 0,
    coinsEarned: 0,
    lastMessageAt: 0,
    updatedAt: 0
  };
}

function getUser(guildId, userId) {
  const store = guildLevels(guildId);
  if (!store[userId]) store[userId] = emptyUser();
  return store[userId];
}

function resetUser(guildId, userId) {
  const store = guildLevels(guildId);
  store[userId] = emptyUser();
  db.save();
  return store[userId];
}

function xpToNext(level) {
  const safe = Math.max(0, Number(level) || 0);
  return 100 + safe * 50;
}

function levelFromXp(totalXp) {
  let remaining = Math.max(0, Number(totalXp) || 0);
  let level = 0;

  while (level < 500) {
    const needed = xpToNext(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }

  return {
    level: level,
    progress: remaining,
    needed: xpToNext(level)
  };
}

function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < Math.max(0, Number(level) || 0); i++) total += xpToNext(i);
  return total;
}

function rewardRoleNames(guild, rewards) {
  return rewards.map(function (reward) {
    const role = guild.roles.cache.get(reward.roleId);
    return role ? role.name : reward.roleId;
  });
}

async function applyRewards(guild, member, fromLevel, toLevel, settings) {
  const rewards = Array.isArray(settings.levelRewards) ? settings.levelRewards : [];
  const gained = rewards.filter(function (reward) {
    const level = Number(reward.level) || 0;
    return level > fromLevel && level <= toLevel && reward.roleId;
  });

  const applied = [];
  for (let i = 0; i < gained.length; i++) {
    const reward = gained[i];
    const role = guild.roles.cache.get(reward.roleId);
    if (!role || !role.editable) continue;
    if (member.roles.cache.has(role.id)) {
      applied.push(role);
      continue;
    }
    try {
      await member.roles.add(role, 'Level reward: reached level ' + reward.level);
      applied.push(role);
    } catch (err) {
      console.error('Level reward role failed for ' + member.id + ':', err.message);
    }
  }

  return applied;
}

function announcementChannel(guild, settings) {
  const id = settings.levelUpChannelId || settings.shopChannelId;
  return id ? guild.channels.cache.get(id) : null;
}

function buildLevelMessage(guild, member, result, settings) {
  const template = settings.levelUpMessage || '**{user}** just reached **Level {level}** in **{server}**!';
  return template
    .split('{user}').join('<@' + member.id + '>')
    .split('{username}').join(member.user.username)
    .split('{level}').join(String(result.level))
    .split('{server}').join(guild.name);
}

async function announce(guild, member, result, settings, source) {
  const channel = announcementChannel(guild, settings);
  if (!channel || !channel.isTextBased()) return;

  const text = buildLevelMessage(guild, member, result, settings);
  const rewardNames = rewardRoleNames(guild, result.rewards || []);
  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setTitle('🎉 Level Up — Level ' + result.level)
    .setDescription(text +
      (rewardNames.length > 0 ? '\n\n**Reward' + (rewardNames.length > 1 ? 's' : '') + ':** ' + rewardNames.join(', ') : '') +
      (result.coins > 0 ? '\n**Level coins:** +' + result.coins : ''))
    .setFooter({ text: config.botName + ' Levels' + (source === 'voice' ? ' • Voice activity' : '') })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(function () {});
}

async function addXp(guild, member, amount, source, settings) {
  if (!guild || !member || member.user.bot) return null;

  const gain = Math.max(0, Math.round(Number(amount) || 0));
  if (gain <= 0) return null;

  const data = getUser(guild.id, member.id);
  const before = levelFromXp(data.totalXp);
  data.totalXp += gain;
  data.level = levelFromXp(data.totalXp).level;
  data.updatedAt = Date.now();

  if (source === 'message') data.messages += 1;
  if (source === 'voice') data.voiceMinutes += 1;
  if (source === 'voice' && member.voice && member.voice.channelId) {
    data.lastVoiceChannelId = member.voice.channelId;
  }

  const after = levelFromXp(data.totalXp);
  let coins = 0;
  let rewards = [];

  if (after.level > before.level) {
    rewards = await applyRewards(guild, member, before.level, after.level, settings);
    const levelCoins = Math.max(0, Number(settings.coinsPerLevel) || 0) * (after.level - before.level);
    if (levelCoins > 0) {
      db.addCoins(guild.id, member.id, levelCoins);
      coins += levelCoins;
    }
  }

  db.messageBuffer += 1;

  return {
    gained: gain,
    level: after.level,
    previousLevel: before.level,
    leveledUp: after.level > before.level,
    progress: after.progress,
    needed: after.needed,
    rewards: rewards,
    coins: coins,
    totalXp: data.totalXp
  };
}

async function handleMessage(message, settings) {
  if (!settings || !settings.levelsEnabled) return null;
  if (!message.guild || !message.member || message.author.bot) return null;
  if (!message.content || message.content.trim().length < 2) return null;

  const prefix = settings.prefix || config.prefix;
  if (message.content.startsWith(prefix)) return null;

  const key = message.guild.id + ':' + message.author.id;
  const now = Date.now();
  const cooldownMs = Math.max(0, Number(settings.xpMessageCooldown) || 0) * 1000;
  const last = messageCooldowns.get(key) || 0;
  if (cooldownMs > 0 && now - last < cooldownMs) return null;
  messageCooldowns.set(key, now);

  const baseXp = Math.max(0, Number(settings.xpPerMessage) || 0);
  if (baseXp <= 0 && !(Number(settings.coinsPerMessage) > 0)) return null;

  const result = await addXp(message.guild, message.member, baseXp + Math.floor(Math.random() * 6), 'message', settings);

  const messageCoins = Math.max(0, Number(settings.coinsPerMessage) || 0);
  if (messageCoins > 0) {
    db.addCoins(message.guild.id, message.author.id, messageCoins);
    if (result) {
      result.coins += messageCoins;
      getUser(message.guild.id, message.author.id).coinsEarned += messageCoins;
    }
  }

  if (result && result.leveledUp) {
    await announce(message.guild, message.member, result, settings, 'message');
  }

  return result;
}

function startVoiceLoop(client) {
  if (voiceTimer) return;

  voiceTimer = setInterval(async function () {
    try {
      await tickVoice(client);
    } catch (err) {
      console.error('Voice XP tick failed:', err.message);
    }
  }, 60000);
  if (voiceTimer.unref) voiceTimer.unref();
}

async function tickVoice(client) {
  if (!client || !client.guilds) return;

  const guilds = client.guilds.cache;
  for (const guild of guilds.values()) {
    const settings = db.getGuild(guild.id);
    if (!settings.levelsEnabled && !settings.questsEnabled && !settings.staffOpsEnabled) continue;

    const baseXp = Math.max(0, Number(settings.xpPerVoiceMinute) || 0);
    const coins = Math.max(0, Number(settings.coinsPerVoiceMinute) || 0);

    const channels = guild.channels.cache.filter(function (channel) {
      return channel.type === 2 && channel.members && channel.members.size > 0;
    });

    for (const channel of channels.values()) {
      for (const member of channel.members.values()) {
        if (!member || member.user.bot || !member.voice) continue;
        if (member.voice.selfDeaf || member.voice.selfMute || member.voice.serverDeaf) continue;
        if (guild.afkChannelId && member.voice.channelId === guild.afkChannelId) continue;

        let result = null;
        if (settings.levelsEnabled && (baseXp > 0 || coins > 0)) {
          result = await addXp(guild, member, baseXp, 'voice', settings);
          if (coins > 0) {
            db.addCoins(guild.id, member.id, coins);
            getUser(guild.id, member.id).coinsEarned += coins;
            if (result) result.coins += coins;
          }
        }
        try {
          progression.recordActivity(guild.id, member.id, 'voice', 1, client);
        } catch (err) {
          console.error('Progression voice activity failed:', err.message);
        }
        staffTracker.trackVoice(guild, member, settings);
        if (result && result.leveledUp) {
          await announce(guild, member, result, settings, 'voice');
        }
      }
    }
  }
}

function getRank(guildId, userId) {
  const data = getUser(guildId, userId);
  const info = levelFromXp(data.totalXp);
  const store = guildLevels(guildId);
  const sorted = Object.keys(store).sort(function (a, b) {
    return (store[b].totalXp || 0) - (store[a].totalXp || 0);
  });
  const index = sorted.indexOf(userId);
  return {
    totalXp: data.totalXp,
    level: info.level,
    progress: info.progress,
    needed: info.needed,
    messages: data.messages,
    voiceMinutes: data.voiceMinutes,
    coinsEarned: data.coinsEarned,
    rank: index === -1 ? sorted.length + 1 : index + 1,
    totalUsers: sorted.length
  };
}

function getLeaderboard(guildId, limit) {
  const store = guildLevels(guildId);
  return Object.keys(store).map(function (userId) {
    const data = store[userId];
    const info = levelFromXp(data.totalXp);
    return {
      userId: userId,
      totalXp: data.totalXp || 0,
      level: info.level,
      messages: data.messages || 0,
      voiceMinutes: data.voiceMinutes || 0,
      coinsEarned: data.coinsEarned || 0
    };
  }).sort(function (a, b) {
    return b.totalXp - a.totalXp;
  }).slice(0, Math.max(1, Math.min(100, Number(limit) || 10)));
}

module.exports = {
  xpToNext,
  totalXpForLevel,
  levelFromXp,
  getUser,
  resetUser,
  addXp,
  handleMessage,
  getRank,
  getLeaderboard,
  startVoiceLoop,
  tickVoice
};
