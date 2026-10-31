const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

let botClient = null;
let saveTimer = null;

function configure(client) {
  botClient = client;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    db.save();
  }, 15000);
  if (saveTimer.unref) saveTimer.unref();
}

function ensureStaffData(guildId) {
  if (!db.data.staffActions) db.data.staffActions = {};
  if (!db.data.staffMetrics) db.data.staffMetrics = {};
  if (!Array.isArray(db.data.staffActions[guildId])) db.data.staffActions[guildId] = [];
  if (!db.data.staffMetrics[guildId]) db.data.staffMetrics[guildId] = {};
}

const ACTION_LABELS = {
  ban: 'Banned a member',
  kick: 'Kicked a member',
  timeout: 'Timed out a member',
  untimeout: 'Removed a timeout',
  warn: 'Warned a member',
  tempban: 'Temporary ban',
  nickname: 'Changed a nickname',
  maintenance_on: 'Enabled maintenance mode',
  maintenance_off: 'Disabled maintenance mode',
  ticket_claim: 'Claimed a ticket',
  ticket_close: 'Closed a ticket',
  ticket_message: 'Replied in a ticket',
  application_accept: 'Accepted a staff application',
  application_deny: 'Denied a staff application',
  appeal_approve: 'Approved an appeal',
  appeal_deny: 'Denied an appeal',
  appeal_review: 'Reviewed an appeal',
  staff_promote: 'Promoted a staff member',
  staff_demote: 'Demoted a staff member',
  staff_remove: 'Removed a staff member',
  join_gate_release: 'Released a join gate hold',
  join_gate_kick: 'Kicked a join gate hold'
};

function sendStaffLog(guildId, staffId, entry) {
  if (!botClient || !botClient.guilds) return;
  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) return;
  const settings = db.getGuild(guildId);
  if (!settings.staffOpsEnabled) return;
  const channelId = settings.staffLogChannelId || settings.logChannel;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const details = entry.details || {};
  const detailLines = [];
  if (details.target) detailLines.push('**Target:** <@' + details.target + '>');
  if (details.reason) detailLines.push('**Reason:** ' + String(details.reason).slice(0, 500));
  if (details.ticket) detailLines.push('**Ticket:** ' + details.ticket);
  if (details.channelId) detailLines.push('**Channel:** <#' + details.channelId + '>');
  if (details.role) detailLines.push('**Role:** ' + details.role);

  channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({ name: 'Staff Operations' })
        .setTitle(ACTION_LABELS[entry.action] || String(entry.action || 'Staff action'))
        .setDescription('**Staff:** <@' + staffId + '>\n' + detailLines.join('\n'))
        .setFooter({ text: config.botName + ' | Powered by ' + config.company })
        .setTimestamp(entry.timestamp)
    ]
  }).catch(function () {});
}

function logStaffAction(guildId, staffId, action, details = {}) {
  ensureStaffData(guildId);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    staffId: staffId,
    action: action,
    details: details,
    timestamp: Date.now()
  };
  db.data.staffActions[guildId].push(entry);
  if (db.data.staffActions[guildId].length > 5000) {
    db.data.staffActions[guildId] = db.data.staffActions[guildId].slice(-2500);
  }
  updateMetrics(guildId, staffId, action, details);
  db.save();
  sendStaffLog(guildId, staffId, entry);
  return entry;
}

function updateMetrics(guildId, staffId, action, details) {
  const metrics = db.data.staffMetrics[guildId];
  if (!metrics[staffId]) {
    metrics[staffId] = {
      ticketsClosed: 0,
      ticketsClaimed: 0,
      messagesInTickets: 0,
      moderationActions: 0,
      bans: 0,
      kicks: 0,
      timeouts: 0,
      warns: 0,
      appealsReviewed: 0,
      appealsApproved: 0,
      appealsDenied: 0,
      tempbans: 0,
      applicationsReviewed: 0,
      messages: 0,
      voiceMinutes: 0,
      commandsUsed: 0,
      firstResponseTimes: [],
      lastActive: Date.now(),
      lastMessageAt: null,
      lastVoiceAt: null,
      lastCommandAt: null
    };
  }
  const m = metrics[staffId];
  m.lastActive = Date.now();
  if (!Array.isArray(m.firstResponseTimes)) m.firstResponseTimes = [];
  if (m.messages === undefined) m.messages = 0;
  if (m.voiceMinutes === undefined) m.voiceMinutes = 0;
  if (m.commandsUsed === undefined) m.commandsUsed = 0;
  if (m.applicationsReviewed === undefined) m.applicationsReviewed = 0;
  if (m.tempbans === undefined) m.tempbans = 0;

  switch (action) {
    case 'ticket_close':
      m.ticketsClosed++;
      if (details.responseTimeMs) m.firstResponseTimes.push(details.responseTimeMs);
      break;
    case 'ticket_claim':
      m.ticketsClaimed++;
      break;
    case 'ticket_message':
      m.messagesInTickets++;
      break;
    case 'ban':
      m.moderationActions++; m.bans++; break;
    case 'kick':
      m.moderationActions++; m.kicks++; break;
    case 'timeout':
      m.moderationActions++; m.timeouts++; break;
    case 'warn':
      m.moderationActions++; m.warns++; break;
    case 'tempban':
      m.moderationActions++; m.tempbans++; break;
    case 'nickname':
    case 'maintenance_on':
    case 'maintenance_off':
      m.moderationActions++; break;
    case 'appeal_approve':
      m.appealsReviewed++; m.appealsApproved++; break;
    case 'appeal_deny':
      m.appealsReviewed++; m.appealsDenied++; break;
    case 'appeal_review':
      m.appealsReviewed++; break;
    case 'application_accept':
      m.applicationsReviewed++; break;
    case 'application_deny':
      m.applicationsReviewed++; break;
    case 'message':
      m.messages++;
      m.lastMessageAt = Date.now();
      break;
    case 'voice':
      m.voiceMinutes += Math.max(1, Number(details.amount) || 1);
      m.lastVoiceAt = Date.now();
      break;
    case 'command':
      m.commandsUsed++;
      m.lastCommandAt = Date.now();
      break;
  }

  if (m.firstResponseTimes.length > 50) m.firstResponseTimes = m.firstResponseTimes.slice(-50);
}

function isStaffMember(member, settings) {
  if (!member || !member.roles) return false;
  if (member.guild && member.guild.ownerId === member.id) return true;
  const roleIds = [];
  [settings.ticketStaffRole, settings.staffApplyAcceptRole].forEach(function (id) {
    if (id) roleIds.push(String(id));
  });
  (Array.isArray(settings.ticketStaffRoles) ? settings.ticketStaffRoles : []).forEach(function (id) {
    if (id) roleIds.push(String(id));
  });
  (Array.isArray(settings.staffApplyAcceptRoles) ? settings.staffApplyAcceptRoles : []).forEach(function (id) {
    if (id) roleIds.push(String(id));
  });
  return roleIds.some(function (id) { return member.roles.cache.has(id); });
}

function trackMessage(guild, member, settings) {
  if (!guild || !member || member.user.bot) return false;
  if (!settings.staffOpsEnabled || !isStaffMember(member, settings)) return false;
  ensureStaffData(guild.id);
  if (!db.data.staffMetrics[guild.id][member.id]) updateMetrics(guild.id, member.id, 'message', {});
  const metrics = db.data.staffMetrics[guild.id][member.id];
  metrics.messages = (metrics.messages || 0) + 1;
  metrics.lastMessageAt = Date.now();
  metrics.lastActive = Date.now();
  scheduleSave();
  return true;
}

function trackVoice(guild, member, settings) {
  if (!guild || !member || member.user.bot) return false;
  if (!settings.staffOpsEnabled || !isStaffMember(member, settings)) return false;
  ensureStaffData(guild.id);
  if (!db.data.staffMetrics[guild.id][member.id]) updateMetrics(guild.id, member.id, 'voice', { amount: 0 });
  const metrics = db.data.staffMetrics[guild.id][member.id];
  metrics.voiceMinutes = (metrics.voiceMinutes || 0) + 1;
  metrics.lastVoiceAt = Date.now();
  metrics.lastActive = Date.now();
  scheduleSave();
  return true;
}

function trackCommand(guild, member, settings) {
  if (!guild || !member || member.user.bot) return false;
  if (!settings.staffOpsEnabled || !isStaffMember(member, settings)) return false;
  ensureStaffData(guild.id);
  if (!db.data.staffMetrics[guild.id][member.id]) updateMetrics(guild.id, member.id, 'command', {});
  const metrics = db.data.staffMetrics[guild.id][member.id];
  metrics.commandsUsed = (metrics.commandsUsed || 0) + 1;
  metrics.lastCommandAt = Date.now();
  metrics.lastActive = Date.now();
  scheduleSave();
  return true;
}

function trackTicketMessage(guildId, staffId, details) {
  ensureStaffData(guildId);
  if (!db.data.staffMetrics[guildId][staffId]) updateMetrics(guildId, staffId, 'ticket_message', details || {});
  const metrics = db.data.staffMetrics[guildId][staffId];
  metrics.messagesInTickets = (metrics.messagesInTickets || 0) + 1;
  metrics.lastActive = Date.now();
  scheduleSave();
  return metrics;
}

function getStaffMetrics(guildId, staffId) {
  ensureStaffData(guildId);
  return db.data.staffMetrics[guildId][staffId] || null;
}

function getAllStaffMetrics(guildId) {
  ensureStaffData(guildId);
  const metrics = db.data.staffMetrics[guildId] || {};

  return Object.keys(metrics).map(function (staffId) {
    const m = metrics[staffId];
    const avgResponse = m.firstResponseTimes && m.firstResponseTimes.length > 0
      ? Math.round(m.firstResponseTimes.reduce(function (a, b) { return a + b; }, 0) / m.firstResponseTimes.length / 60000)
      : null;
    const enriched = Object.assign({}, m, {
      userId: staffId,
      staffId: staffId,
      avgResponseTimeMinutes: avgResponse,
      messages: m.messages || 0,
      voiceMinutes: m.voiceMinutes || 0,
      commandsUsed: m.commandsUsed || 0,
      applicationsReviewed: m.applicationsReviewed || 0
    });
    enriched.efficiencyScore = calculateEfficiency(enriched);
    return enriched;
  }).filter(function (m) {
    return m.ticketsClosed > 0 || m.moderationActions > 0 || m.appealsReviewed > 0 ||
      m.ticketsClaimed > 0 || m.messages > 0 || m.voiceMinutes > 0 || m.commandsUsed > 0;
  });
}

function calculateEfficiency(m) {
  let score = 0;
  score += (m.ticketsClosed || 0) * 10;
  score += (m.ticketsClaimed || 0) * 5;
  score += (m.messagesInTickets || 0) * 0.5;
  score += (m.moderationActions || 0) * 8;
  score += (m.appealsReviewed || 0) * 15;
  score += (m.applicationsReviewed || 0) * 6;
  score += (m.messages || 0) * 0.05;
  score += (m.voiceMinutes || 0) * 0.3;
  score += (m.commandsUsed || 0) * 1.5;
  if (m.avgResponseTimeMinutes !== null && m.avgResponseTimeMinutes !== undefined) {
    if (m.avgResponseTimeMinutes < 5) score += 50;
    else if (m.avgResponseTimeMinutes < 15) score += 30;
    else if (m.avgResponseTimeMinutes < 60) score += 10;
  }
  return Math.round(score);
}

function getStaffLeaderboard(guildId, limit = 10) {
  const all = getAllStaffMetrics(guildId);
  return all.sort((a, b) => b.efficiencyScore - a.efficiencyScore).slice(0, limit);
}

function getStaffActions(guildId, staffId, limit = 50) {
  ensureStaffData(guildId);
  return (db.data.staffActions[guildId] || [])
    .filter(a => a.staffId === staffId)
    .slice(-limit)
    .reverse();
}

function generateAdvice(guildId, suppliedSettings) {
  const all = getAllStaffMetrics(guildId);
  const settings = suppliedSettings || db.getGuild(guildId);
  const threshold = Math.max(10, Number(settings.staffPromotionThreshold) || 200);
  const inactiveDays = Math.max(1, Number(settings.staffInactiveDays) || 14);
  const inactiveCutoff = Date.now() - inactiveDays * 86400000;
  const activeCutoff = Date.now() - 7 * 86400000;

  return all.map(function (m) {
    const lastActive = m.lastActive || 0;
    const recentActivity = lastActive >= activeCutoff;
    if (lastActive < inactiveCutoff) {
      return {
        userId: m.userId,
        action: 'demote',
        reason: 'Inactive for more than ' + inactiveDays + ' days (last active ' + new Date(lastActive || Date.now()).toLocaleDateString() + ')',
        priority: 'high',
        score: m.efficiencyScore,
        lastActive: lastActive,
        metrics: m
      };
    }
    if (m.efficiencyScore >= threshold && recentActivity) {
      return {
        userId: m.userId,
        action: 'promote',
        reason: 'Strong activity score (' + m.efficiencyScore + '), active within 7 days, with ' +
          (m.ticketsClosed || 0) + ' ticket closes and ' + (m.moderationActions || 0) + ' moderation actions',
        priority: 'high',
        score: m.efficiencyScore,
        lastActive: lastActive,
        metrics: m
      };
    }
    if (m.efficiencyScore >= Math.round(threshold * 0.6)) {
      return {
        userId: m.userId,
        action: 'review',
        reason: 'Close to the promotion threshold (' + m.efficiencyScore + '/' + threshold + '). Give them more responsibility and review again soon.',
        priority: 'medium',
        score: m.efficiencyScore,
        lastActive: lastActive,
        metrics: m
      };
    }
    if ((m.ticketsClosed || 0) === 0 && (m.moderationActions || 0) === 0 && (m.appealsReviewed || 0) === 0) {
      return {
        userId: m.userId,
        action: 'review',
        reason: 'Limited recorded actions. Check in with this staff member and encourage ticket or moderation activity.',
        priority: 'low',
        score: m.efficiencyScore,
        lastActive: lastActive,
        metrics: m
      };
    }
    return {
      userId: m.userId,
      action: 'keep',
      reason: 'Steady activity. Keep the current role and continue monitoring.',
      priority: 'low',
      score: m.efficiencyScore,
      lastActive: lastActive,
      metrics: m
    };
  }).sort(function (a, b) {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] || 2) - (order[b.priority] || 2);
  });
}

function getRecentActions(guildId, limit) {
  ensureStaffData(guildId);
  return (db.data.staffActions[guildId] || []).slice(-Math.max(1, Math.min(100, Number(limit) || 25))).reverse();
}

async function runReview(guild, suppliedSettings) {
  if (!guild) return null;
  const settings = suppliedSettings || db.getGuild(guild.id);
  if (!settings.staffOpsEnabled) return null;
  const advice = generateAdvice(guild.id, settings).filter(function (row) {
    return row.action === 'promote' || row.action === 'demote';
  }).slice(0, 8);
  if (advice.length === 0) return null;

  const channelId = settings.staffAdviceChannelId || settings.staffLogChannelId || settings.logChannel;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return null;

  const lines = advice.map(function (row) {
    return '• <@' + row.userId + '> — **' + row.action.toUpperCase() + '** (score ' + row.score + ')\n' + row.reason;
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📈 Staff Operations — Promotion Review')
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: config.botName + ' | Powered by ' + config.company })
        .setTimestamp()
    ]
  }).catch(function () {});

  db.updateGuild(guild.id, { staffOpsLastReviewAt: Date.now() });
  return advice;
}

function startReviewLoop(client) {
  if (!client) return;
  const timer = setInterval(function () {
    const guilds = client.guilds && client.guilds.cache ? client.guilds.cache : null;
    if (!guilds) return;
    guilds.forEach(function (guild) {
      const settings = db.getGuild(guild.id);
      if (!settings.staffOpsEnabled) return;
      const intervalHours = Math.max(1, Number(settings.staffReviewIntervalHours) || 24);
      const last = Number(settings.staffOpsLastReviewAt) || 0;
      if (Date.now() - last < intervalHours * 3600000) return;
      runReview(guild, settings).catch(function (err) {
        console.error('Staff review failed for ' + guild.id + ':', err.message);
      });
    });
  }, 30 * 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  configure,
  logStaffAction,
  getStaffMetrics,
  getAllStaffMetrics,
  getStaffLeaderboard,
  getStaffActions,
  getRecentActions,
  generateAdvice,
  runReview,
  startReviewLoop,
  trackMessage,
  trackVoice,
  trackCommand,
  trackTicketMessage,
  isStaffMember,
  ensureStaffData
};