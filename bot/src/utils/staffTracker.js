const db = require('../database/db');
const config = require('../../config.json');

function ensureStaffData(guildId) {
  if (!db.data.staffActions) db.data.staffActions = {};
  if (!db.data.staffMetrics) db.data.staffMetrics = {};
  if (!Array.isArray(db.data.staffActions[guildId])) db.data.staffActions[guildId] = [];
  if (!db.data.staffMetrics[guildId]) db.data.staffMetrics[guildId] = {};
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
      firstResponseTimes: [],
      lastActive: Date.now()
    };
  }
  const m = metrics[staffId];
  m.lastActive = Date.now();

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
    case 'appeal_approve':
      m.appealsReviewed++; m.appealsApproved++; break;
    case 'appeal_deny':
      m.appealsReviewed++; m.appealsDenied++; break;
    case 'appeal_review':
      m.appealsReviewed++; break;
  }

  if (m.firstResponseTimes.length > 50) m.firstResponseTimes = m.firstResponseTimes.slice(-50);
}

function getStaffMetrics(guildId, staffId) {
  ensureStaffData(guildId);
  return db.data.staffMetrics[guildId][staffId] || null;
}

function getAllStaffMetrics(guildId) {
  ensureStaffData(guildId);
  const metrics = db.data.staffMetrics[guildId] || {};
  const settings = db.getGuild(guildId);
  const staffRoleIds = [];
  if (settings.ticketStaffRole) staffRoleIds.push(settings.ticketStaffRole);
  (settings.ticketStaffRoles || []).forEach(id => { if (!staffRoleIds.includes(id)) staffRoleIds.push(id); });
  (settings.staffApplyAcceptRoles || []).forEach(id => { if (!staffRoleIds.includes(id)) staffRoleIds.push(id); });
  if (settings.staffApplyAcceptRole && !staffRoleIds.includes(settings.staffApplyAcceptRole)) staffRoleIds.push(settings.staffApplyAcceptRole);

  return staffRoleIds.map(roleId => {
    const m = metrics[roleId] || { ticketsClosed: 0, ticketsClaimed: 0, messagesInTickets: 0, moderationActions: 0, bans: 0, kicks: 0, timeouts: 0, warns: 0, appealsReviewed: 0, appealsApproved: 0, appealsDenied: 0, firstResponseTimes: [], lastActive: 0 };
    const avgResponse = m.firstResponseTimes.length > 0
      ? Math.round(m.firstResponseTimes.reduce((a, b) => a + b, 0) / m.firstResponseTimes.length / 60000)
      : null;
    return {
      roleId: roleId,
      ...m,
      avgResponseTimeMinutes: avgResponse,
      efficiencyScore: calculateEfficiency(m)
    };
  }).filter(m => m.ticketsClosed > 0 || m.moderationActions > 0 || m.appealsReviewed > 0);
}

function calculateEfficiency(m) {
  let score = 0;
  score += m.ticketsClosed * 10;
  score += m.ticketsClaimed * 5;
  score += m.messagesInTickets * 0.5;
  score += m.moderationActions * 8;
  score += m.appealsReviewed * 15;
  if (m.avgResponseTimeMinutes !== null) {
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

function generateAdvice(guildId) {
  const all = getAllStaffMetrics(guildId);
  const cutoff = Date.now() - 30 * 86400000;
  return all.map(m => {
    const recentCloses = (m.recentTicketCloses || 0);
    if (m.efficiencyScore >= 500 && m.ticketsClosed >= 5) {
      return { roleId: m.roleId, action: 'promote', reason: 'High efficiency (' + m.efficiencyScore + ') and ' + m.ticketsClosed + ' closes', priority: 'high' };
    }
    if (m.lastActive < cutoff && (m.ticketsClosed > 0 || m.moderationActions > 0)) {
      return { roleId: m.roleId, action: 'demote', reason: 'Inactive for 30+ days (last: ' + new Date(m.lastActive).toLocaleDateString() + ')', priority: 'medium' };
    }
    if (m.ticketsClosed === 0 && m.moderationActions === 0 && m.appealsReviewed === 0) {
      return { roleId: m.roleId, action: 'review', reason: 'No recorded activity in 30 days', priority: 'low' };
    }
    return null;
  }).filter(Boolean);
}

module.exports = {
  logStaffAction,
  getStaffMetrics,
  getAllStaffMetrics,
  getStaffLeaderboard,
  getStaffActions,
  generateAdvice,
  ensureStaffData
};