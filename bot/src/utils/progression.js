const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');

let botClient = null;
let saveTimer = null;

const BADGES = [
  { id: 'first_steps', name: 'First Steps', emoji: '🌱', description: 'Reach level 5.', check: function (s) { return s.level >= 5; }, progress: function (s) { return s.level / 5; } },
  { id: 'rising_star', name: 'Rising Star', emoji: '🌟', description: 'Reach level 10.', check: function (s) { return s.level >= 10; }, progress: function (s) { return s.level / 10; } },
  { id: 'veteran', name: 'Veteran', emoji: '🏅', description: 'Reach level 25.', check: function (s) { return s.level >= 25; }, progress: function (s) { return s.level / 25; } },
  { id: 'legend', name: 'Legend', emoji: '👑', description: 'Reach level 50.', check: function (s) { return s.level >= 50; }, progress: function (s) { return s.level / 50; } },
  { id: 'chatterbox', name: 'Chatterbox', emoji: '💬', description: 'Send 1,000 messages.', check: function (s) { return s.messages >= 1000; }, progress: function (s) { return s.messages / 1000; } },
  { id: 'voice_regular', name: 'Voice Regular', emoji: '🎙️', description: 'Spend 600 minutes in voice.', check: function (s) { return s.voiceMinutes >= 600; }, progress: function (s) { return s.voiceMinutes / 600; } },
  { id: 'coin_collector', name: 'Coin Collector', emoji: '💰', description: 'Earn 10,000 coins.', check: function (s) { return s.coinsEarned >= 10000; }, progress: function (s) { return s.coinsEarned / 10000; } },
  { id: 'inviter', name: 'Inviter', emoji: '📨', description: 'Bring in 10 real members.', check: function (s) { return s.invites >= 10; }, progress: function (s) { return s.invites / 10; } },
  { id: 'shopper', name: 'Shopper', emoji: '🛍️', description: 'Buy 5 shop items.', check: function (s) { return s.purchases >= 5; }, progress: function (s) { return s.purchases / 5; } },
  { id: 'quest_hunter', name: 'Quest Hunter', emoji: '🎯', description: 'Complete 10 quests.', check: function (s) { return s.questsCompleted >= 10; }, progress: function (s) { return s.questsCompleted / 10; } },
  { id: 'streak_7', name: 'Week Streak', emoji: '🔥', description: 'Stay active for 7 days in a row.', check: function (s) { return s.streak >= 7; }, progress: function (s) { return s.streak / 7; } },
  { id: 'streak_30', name: 'Month Streak', emoji: '💎', description: 'Stay active for 30 days in a row.', check: function (s) { return s.streak >= 30; }, progress: function (s) { return s.streak / 30; } }
];

function dayKey(date) {
  const value = date || new Date();
  return value.getUTCFullYear() + '-' + String(value.getUTCMonth() + 1).padStart(2, '0') + '-' + String(value.getUTCDate()).padStart(2, '0');
}

function weekKey(date) {
  const value = date || new Date();
  const first = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const day = Math.floor((value - first) / 86400000);
  const week = Math.ceil((day + first.getUTCDay() + 1) / 7);
  return value.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function ensureGuild(guildId) {
  if (!db.data.progression) db.data.progression = {};
  if (!db.data.progression[guildId]) db.data.progression[guildId] = {};
  return db.data.progression[guildId];
}

function emptyQuestState() {
  return {
    daily: { key: dayKey(), progress: { messages: 0, voice: 0 }, completed: {} },
    weekly: { key: weekKey(), progress: { messages: 0, voice: 0, purchases: 0 }, completed: {} }
  };
}

function ensureUser(guildId, userId) {
  const guild = ensureGuild(guildId);
  if (!guild[userId]) {
    guild[userId] = {
      badges: {},
      quests: emptyQuestState(),
      streak: { count: 0, lastDay: null },
      totals: { questsCompleted: 0, purchases: 0, invites: 0, vouches: 0 },
      updatedAt: 0
    };
  }
  const user = guild[userId];
  if (!user.badges) user.badges = {};
  if (!user.quests) user.quests = emptyQuestState();
  if (!user.quests.daily) user.quests.daily = emptyQuestState().daily;
  if (!user.quests.weekly) user.quests.weekly = emptyQuestState().weekly;
  if (!user.quests.daily.progress) user.quests.daily.progress = { messages: 0, voice: 0 };
  if (!user.quests.weekly.progress) user.quests.weekly.progress = { messages: 0, voice: 0, purchases: 0 };
  if (!user.quests.daily.completed) user.quests.daily.completed = {};
  if (!user.quests.weekly.completed) user.quests.weekly.completed = {};
  if (!user.streak) user.streak = { count: 0, lastDay: null };
  if (!user.totals) user.totals = { questsCompleted: 0, purchases: 0, invites: 0, vouches: 0 };
  return user;
}

function questDefinitions(settings) {
  return [
    { id: 'daily_messages', period: 'daily', metric: 'messages', label: 'Send messages', goal: Math.max(1, Number(settings.questDailyMessages) || 50), reward: Math.max(0, Number(settings.questDailyCoins) || 50) },
    { id: 'daily_voice', period: 'daily', metric: 'voice', label: 'Spend minutes in voice', goal: Math.max(1, Number(settings.questDailyVoice) || 30), reward: Math.max(0, Number(settings.questDailyCoins) || 50) },
    { id: 'weekly_messages', period: 'weekly', metric: 'messages', label: 'Send messages this week', goal: Math.max(1, Number(settings.questWeeklyMessages) || 250), reward: Math.max(0, Number(settings.questWeeklyCoins) || 250) },
    { id: 'weekly_voice', period: 'weekly', metric: 'voice', label: 'Spend minutes in voice this week', goal: Math.max(1, Number(settings.questWeeklyVoice) || 180), reward: Math.max(0, Number(settings.questWeeklyCoins) || 250) },
    { id: 'weekly_purchases', period: 'weekly', metric: 'purchases', label: 'Buy shop items this week', goal: Math.max(1, Number(settings.questWeeklyPurchases) || 3), reward: Math.max(0, Number(settings.questWeeklyCoins) || 250) }
  ];
}

function refreshQuestWindows(user) {
  const today = dayKey();
  const thisWeek = weekKey();
  if (user.quests.daily.key !== today) {
    user.quests.daily = { key: today, progress: { messages: 0, voice: 0 }, completed: {} };
  }
  if (user.quests.weekly.key !== thisWeek) {
    user.quests.weekly = { key: thisWeek, progress: { messages: 0, voice: 0, purchases: 0 }, completed: {} };
  }
}

function countPurchases(guildId, userId) {
  const list = Array.isArray(db.data.purchases && db.data.purchases[guildId]) ? db.data.purchases[guildId] : [];
  return list.filter(function (item) { return String(item.userId) === String(userId); }).length;
}

function countVouches(guildId, userId) {
  const list = Array.isArray(db.data.vouches && db.data.vouches[guildId]) ? db.data.vouches[guildId] : [];
  return list.filter(function (item) { return String(item.to || item.userId || '') === String(userId); }).length;
}

function statsFor(guildId, userId) {
  const levelsStore = db.data.levels && db.data.levels[guildId] ? db.data.levels[guildId] : {};
  const levelData = levelsStore[userId] || {};
  const user = ensureUser(guildId, userId);
  const invites = db.getInviteStats(guildId, userId);
  return {
    level: Number(levelData.level) || 0,
    totalXp: Number(levelData.totalXp) || 0,
    messages: Math.max(Number(levelData.messages) || 0, db.getMessages(guildId, userId)),
    voiceMinutes: Number(levelData.voiceMinutes) || 0,
    coinsEarned: Number(levelData.coinsEarned) || 0,
    coins: db.getCoins(guildId, userId),
    invites: Number(invites.real) || Number(invites.total) || 0,
    purchases: Math.max(Number(user.totals.purchases) || 0, countPurchases(guildId, userId)),
    questsCompleted: Number(user.totals.questsCompleted) || 0,
    streak: Number(user.streak.count) || 0,
    vouches: Math.max(Number(user.totals.vouches) || 0, countVouches(guildId, userId)),
    warnings: db.getWarnings(guildId, userId).length
  };
}

function checkBadges(guildId, userId) {
  const user = ensureUser(guildId, userId);
  const stats = statsFor(guildId, userId);
  const unlocked = [];
  BADGES.forEach(function (badge) {
    if (user.badges[badge.id]) return;
    if (!badge.check(stats)) return;
    user.badges[badge.id] = Date.now();
    unlocked.push(badge);
  });
  if (unlocked.length > 0) {
    user.updatedAt = Date.now();
    db.save();
  }
  return unlocked;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    db.save();
  }, 15000);
  if (saveTimer.unref) saveTimer.unref();
}

function announce(guildId, userId, newBadges, completedQuests, client) {
  if (!newBadges.length && !completedQuests.length) return;
  const activeClient = client || botClient;
  if (!activeClient || !activeClient.guilds) return;
  const guild = activeClient.guilds.cache.get(guildId);
  if (!guild) return;
  const settings = db.getGuild(guildId);
  const channelId = settings.progressionLogChannelId || settings.levelUpChannelId || settings.logChannel;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return;

  const lines = [];
  newBadges.forEach(function (badge) {
    lines.push('🏅 <@' + userId + '> unlocked **' + badge.emoji + ' ' + badge.name + '** — ' + badge.description);
  });
  completedQuests.forEach(function (quest) {
    lines.push('🎯 <@' + userId + '> completed **' + quest.label + '** and earned **' + quest.reward + ' coins**.');
  });

  channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('Community Progression')
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: config.botName + ' Progression | Powered by ' + config.company })
        .setTimestamp()
    ]
  }).catch(function () {});
}

function recordActivity(guildId, userId, type, amount, client) {
  if (!guildId || !userId) return { newBadges: [], completedQuests: [] };
  const user = ensureUser(guildId, userId);
  const value = Math.max(0, Number(amount) || 0);
  const today = dayKey();
  refreshQuestWindows(user);

  if (type === 'purchase') user.totals.purchases = (user.totals.purchases || 0) + value;
  if (type === 'invite') user.totals.invites = (user.totals.invites || 0) + value;
  if (type === 'vouch') user.totals.vouches = (user.totals.vouches || 0) + value;

  if (type === 'message' || type === 'voice' || type === 'purchase' || type === 'invite' || type === 'vouch') {
    const lastDay = user.streak.lastDay;
    if (lastDay !== today) {
      const yesterday = new Date(Date.now() - 86400000);
      if (lastDay === dayKey(yesterday)) user.streak.count = (user.streak.count || 0) + 1;
      else user.streak.count = 1;
      user.streak.lastDay = today;
    }
  }

  const settings = db.getGuild(guildId);
  const completedQuests = [];
  if (settings.questsEnabled) {
    const definitions = questDefinitions(settings);
    definitions.forEach(function (quest) {
      const bucket = user.quests[quest.period];
      if (quest.metric === 'purchases') {
        if (type !== 'purchase') return;
        bucket.progress.purchases = (bucket.progress.purchases || 0) + value;
      } else if (quest.metric === 'messages') {
        if (type !== 'message') return;
        bucket.progress.messages = (bucket.progress.messages || 0) + value;
      } else if (quest.metric === 'voice') {
        if (type !== 'voice') return;
        bucket.progress.voice = (bucket.progress.voice || 0) + value;
      }
      const progress = Number(bucket.progress[quest.metric]) || 0;
      if (progress >= quest.goal && !bucket.completed[quest.id]) {
        bucket.completed[quest.id] = Date.now();
        user.totals.questsCompleted = (user.totals.questsCompleted || 0) + 1;
        if (quest.reward > 0) db.addCoins(guildId, userId, quest.reward);
        completedQuests.push(quest);
      }
    });
  }

  user.updatedAt = Date.now();
  const newBadges = checkBadges(guildId, userId);
  scheduleSave();
  announce(guildId, userId, newBadges, completedQuests, client);
  return { newBadges: newBadges, completedQuests: completedQuests };
}

function getProfile(guildId, userId, guild) {
  const user = ensureUser(guildId, userId);
  refreshQuestWindows(user);
  const stats = statsFor(guildId, userId);
  const settings = db.getGuild(guildId);
  const levels = require('./levels');
  const rank = levels.getRank(guildId, userId);
  const definitions = questDefinitions(settings);
  const member = guild && guild.members && guild.members.cache ? guild.members.cache.get(userId) : null;

  const badges = BADGES.map(function (badge) {
    const unlockedAt = user.badges[badge.id] || null;
    let progress = Number(badge.progress(stats)) || 0;
    if (progress > 1) progress = 1;
    if (unlockedAt) progress = 1;
    return {
      id: badge.id,
      name: badge.name,
      emoji: badge.emoji,
      description: badge.description,
      unlocked: Boolean(unlockedAt),
      unlockedAt: unlockedAt,
      progress: Math.round(progress * 100)
    };
  });

  const quests = definitions.map(function (quest) {
    const bucket = user.quests[quest.period];
    const progress = Number(bucket.progress[quest.metric]) || 0;
    return {
      id: quest.id,
      period: quest.period,
      label: quest.label,
      goal: quest.goal,
      progress: Math.min(progress, quest.goal),
      reward: quest.reward,
      completed: Boolean(bucket.completed[quest.id])
    };
  });

  return {
    userId: userId,
    username: member ? member.user.tag : null,
    displayName: member ? member.displayName : null,
    avatar: member ? member.user.displayAvatarURL({ size: 128 }) : null,
    joinedAt: member ? member.joinedTimestamp : null,
    level: stats.level,
    totalXp: stats.totalXp,
    rank: rank.rank,
    totalRanked: rank.totalUsers,
    progress: rank.progress,
    needed: rank.needed,
    coins: stats.coins,
    coinsEarned: stats.coinsEarned,
    messages: stats.messages,
    voiceMinutes: stats.voiceMinutes,
    invites: stats.invites,
    purchases: stats.purchases,
    questsCompleted: stats.questsCompleted,
    streak: stats.streak,
    vouches: stats.vouches,
    warnings: stats.warnings,
    badges: badges,
    badgeCount: badges.filter(function (badge) { return badge.unlocked; }).length,
    totalBadges: badges.length,
    quests: quests,
    questsEnabled: Boolean(settings.questsEnabled)
  };
}

function getBadgeCatalog() {
  return BADGES.map(function (badge) {
    return { id: badge.id, name: badge.name, emoji: badge.emoji, description: badge.description };
  });
}

function getBadgeStats(guildId) {
  const guild = ensureGuild(guildId);
  const counts = {};
  BADGES.forEach(function (badge) { counts[badge.id] = 0; });
  Object.keys(guild).forEach(function (userId) {
    const user = guild[userId];
    BADGES.forEach(function (badge) {
      if (user.badges && user.badges[badge.id]) counts[badge.id]++;
    });
  });
  return BADGES.map(function (badge) {
    return { id: badge.id, name: badge.name, emoji: badge.emoji, description: badge.description, count: counts[badge.id] || 0 };
  });
}

function getLeaderboard(guildId, limit) {
  const guild = ensureGuild(guildId);
  const levelsStore = db.data.levels && db.data.levels[guildId] ? db.data.levels[guildId] : {};
  const ids = {};
  Object.keys(guild).forEach(function (id) { ids[id] = true; });
  Object.keys(levelsStore).forEach(function (id) { ids[id] = true; });

  return Object.keys(ids).map(function (userId) {
    const stats = statsFor(guildId, userId);
    let badgeCount = 0;
    BADGES.forEach(function (badge) {
      if (guild[userId] && guild[userId].badges && guild[userId].badges[badge.id]) badgeCount++;
    });
    return {
      userId: userId,
      level: stats.level,
      totalXp: stats.totalXp,
      messages: stats.messages,
      voiceMinutes: stats.voiceMinutes,
      questsCompleted: stats.questsCompleted,
      streak: stats.streak,
      badgeCount: badgeCount
    };
  }).sort(function (a, b) {
    if (b.badgeCount !== a.badgeCount) return b.badgeCount - a.badgeCount;
    if (b.level !== a.level) return b.level - a.level;
    return b.totalXp - a.totalXp;
  }).slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
}

function configure(client) {
  botClient = client;
}

module.exports = {
  BADGES: getBadgeCatalog(),
  configure: configure,
  recordActivity: recordActivity,
  checkBadges: checkBadges,
  getProfile: getProfile,
  getLeaderboard: getLeaderboard,
  getBadgeCatalog: getBadgeCatalog,
  getBadgeStats: getBadgeStats,
  questDefinitions: questDefinitions
};
