const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('../database/db');
const appealUtil = require('../utils/appeal');
const ticketAssistant = require('../utils/ticketAssistant');
const customCommands = require('../utils/customCommands');
const reactionRoles = require('../utils/reactionRoles');
const vouch = require('../utils/vouch');
const staffTracker = require('../utils/staffTracker');
const verification = require('../utils/verification');
const maintenance = require('../utils/maintenance');
const enhancedInvites = require('../utils/inviteLogger');
const nicknameUtil = require('../utils/nickname');
const advancedPurge = require('../utils/advancedPurge');
const levels = require('../utils/levels');
const shop = require('../utils/shop');
const tempActions = require('../utils/tempActions');
const scheduler = require('../utils/scheduler');
const serverAudit = require('../utils/serverAudit');
const integrations = require('../utils/integrations');

const API_KEY = process.env.BOT_API_KEY || process.env.ZYRON_API_KEY || '';
const ENABLED = String(process.env.BOT_API_ENABLED || '').toLowerCase() === 'true' || Boolean(API_KEY);
const HOST = process.env.BOT_API_HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || process.env.BOT_API_PORT || '4000', 10) || 4000;
const PUBLIC_URL = process.env.BOT_API_PUBLIC_URL || '';
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';
const ALLOWED_ORIGINS = String(process.env.DASHBOARD_ORIGIN || '*')
  .split(',')
  .map(function (value) { return value.trim(); })
  .filter(Boolean);

const MAX_BODY = 1024 * 1024;

let botClient = null;
let server = null;
let startedAt = 0;
let lastHeartbeat = null;
let requestCount = 0;

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  let allow = '';

  if (ALLOWED_ORIGINS.indexOf('*') !== -1) {
    allow = '*';
  } else if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    allow = origin;
  }

  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

function getProvidedKey(req, url) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().indexOf('bearer ') === 0) return header.slice(7).trim();
  if (req.headers['x-api-key']) return String(req.headers['x-api-key']).trim();
  if (url && url.searchParams.get('key')) return url.searchParams.get('key').trim();
  return '';
}

function isAuthorized(req, url) {
  if (!API_KEY) return false;
  return safeEqual(getProvidedKey(req, url), API_KEY);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];

    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function summarizeSettings(settings) {
  return {
    prefix: settings.prefix,
    antiNukeEnabled: settings.antiNukeEnabled,
    punishment: settings.punishment,
    raidPunishment: settings.raidPunishment,
    aiEnabled: settings.aiEnabled,
    aiModel: settings.aiModel || null,
    aiScanMessages: settings.aiScanMessages,
    aiConfidence: settings.aiConfidence,
    aiAction: settings.aiAction,
    economyDaily: settings.economyDaily,
    economyInvite: settings.economyInvite,
    logChannel: settings.logChannel || null,
    autoRoleId: settings.autoRoleId || null,
    autoRoleBotId: settings.autoRoleBotId || null,
    boosterRoleId: settings.boosterRoleId || null,
    ticketCategory: settings.ticketCategory || null,
    ticketLogChannel: settings.ticketLogChannel || null,
    ticketStaffRole: settings.ticketStaffRole || null,
    ticketStaffRoles: Array.isArray(settings.ticketStaffRoles) ? settings.ticketStaffRoles : [],
    ticketNamePattern: settings.ticketNamePattern || 'ticket-{{ticket_number}}',
    ticketAiEnabled: settings.ticketAiEnabled !== false,
    ticketPanelChannel: settings.ticketPanelChannel || null,
    ticketPanelTitle: settings.ticketPanelTitle || null,
    ticketPanelDescription: settings.ticketPanelDescription || null,
    ticketPanelFooter: settings.ticketPanelFooter || null,
    ticketCreateLabel: settings.ticketCreateLabel || 'Create Ticket',
    ticketCreateEmoji: settings.ticketCreateEmoji || '🎫',
    ticketButtons: Array.isArray(settings.ticketButtons) ? settings.ticketButtons : [],
    applicationChannel: settings.applicationChannel || null,
    staffApplyAcceptRole: settings.staffApplyAcceptRole || null,
    staffApplyAcceptRoles: Array.isArray(settings.staffApplyAcceptRoles) ? settings.staffApplyAcceptRoles : [],
    appealInviteChannel: settings.appealInviteChannel || null,
    warningKickThreshold: settings.warningKickThreshold || 5,
    staffApplyPanelTitle: settings.staffApplyPanelTitle || null,
    staffApplyPanelDescription: settings.staffApplyPanelDescription || null,
    staffApplyPanelFooter: settings.staffApplyPanelFooter || null,
    staffApplyButtonLabel: settings.staffApplyButtonLabel || 'Apply Now',
    staffApplyButtonEmoji: settings.staffApplyButtonEmoji || '📝',
    staffApplyModalTitle: settings.staffApplyModalTitle || 'Staff Application',
    staffApplyAcceptMessage: settings.staffApplyAcceptMessage || null,
    staffApplyDenyMessage: settings.staffApplyDenyMessage || null,
    staffApplyQuestions: Array.isArray(settings.staffApplyQuestions) ? settings.staffApplyQuestions : [],
    verificationEnabled: settings.verificationEnabled === true,
    verificationChannel: settings.verificationChannel || null,
    verificationRole: settings.verificationRole || null,
    verificationRoles: Array.isArray(settings.verificationRoles) ? settings.verificationRoles : [],
    verificationRules: settings.verificationRules || null,
    verificationLogChannel: settings.verificationLogChannel || null,
    verificationQuestions: Array.isArray(settings.verificationQuestions) ? settings.verificationQuestions : [],
    verificationMode: settings.verificationMode || 'button',
    maintenanceMode: settings.maintenanceMode === true,
    maintenanceMessage: settings.maintenanceMessage || null,
    maintenanceChannelId: settings.maintenanceChannelId || null,
    maintenanceAnnouncementChannelId: settings.maintenanceAnnouncementChannelId || null,
    maintenanceAllowedRoles: Array.isArray(settings.maintenanceAllowedRoles) ? settings.maintenanceAllowedRoles : [],
    maintenanceStartedAt: settings.maintenanceStartedAt || null,
    maintenanceStartedBy: settings.maintenanceStartedBy || null,
    vouchLogChannel: settings.vouchLogChannel || null,
    feedbackChannel: settings.feedbackChannel || null,
    dmWarnings: settings.dmWarnings !== false,
    dmSecurity: settings.dmSecurity !== false,
    dmTicketUpdates: settings.dmTicketUpdates !== false,
    dmFeedback: settings.dmFeedback !== false,
    ticketRatingsEnabled: settings.ticketRatingsEnabled !== false,
    ticketPriorityEnabled: settings.ticketPriorityEnabled === true,
    ticketPriorities: Array.isArray(settings.ticketPriorities) ? settings.ticketPriorities : [],
    customCommandRole: settings.customCommandRole || null,
    inviteLogChannel: settings.inviteLogChannel || null,
    nicknameLogChannel: settings.nicknameLogChannel || null,
    bannedNickPatterns: Array.isArray(settings.bannedNickPatterns) ? settings.bannedNickPatterns : [],
    levelsEnabled: settings.levelsEnabled === true,
    xpPerMessage: settings.xpPerMessage,
    xpMessageCooldown: settings.xpMessageCooldown,
    xpPerVoiceMinute: settings.xpPerVoiceMinute,
    coinsPerMessage: settings.coinsPerMessage,
    coinsPerVoiceMinute: settings.coinsPerVoiceMinute,
    coinsPerLevel: settings.coinsPerLevel,
    levelUpChannelId: settings.levelUpChannelId || null,
    levelRewards: Array.isArray(settings.levelRewards) ? settings.levelRewards : [],
    levelUpMessage: settings.levelUpMessage || null,
    shopEnabled: settings.shopEnabled === true,
    shopChannelId: settings.shopChannelId || null,
    shopLogChannel: settings.shopLogChannel || null,
    serverAuditEnabled: settings.serverAuditEnabled === true,
    serverAuditIntervalHours: settings.serverAuditIntervalHours || 24,
    serverAuditChannelId: settings.serverAuditChannelId || null,
    serverAuditLastAt: settings.serverAuditLastAt || null,
    serverAuditReport: settings.serverAuditReport || null,
    features: settings.features || {}
  };
}

function getGuildList() {
  if (!botClient || !botClient.guilds || !botClient.guilds.cache) return [];

  const list = [];
  botClient.guilds.cache.forEach(function (guild) {
    let settings = null;
    try {
      settings = db.getGuild(guild.id);
    } catch (err) {
      settings = null;
    }

    list.push({
      id: guild.id,
      name: guild.name,
      icon: guild.icon || null,
      memberCount: typeof guild.memberCount === 'number' ? guild.memberCount : null,
      ownerId: guild.ownerId || null,
      settings: settings ? summarizeSettings(settings) : null
    });
  });

  return list;
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, maxLength);
}

function cleanId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^\d{5,25}$/.test(text)) return undefined;
  return text;
}

function cleanIdList(list, limit) {
  const ids = [];
  if (!Array.isArray(list)) return ids;
  list.slice(0, limit || 10).forEach(function (value) {
    const id = cleanId(value);
    if (id && ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

function sanitizeTicketButtons(list) {
  const buttons = [];
  if (!Array.isArray(list)) return buttons;

  list.slice(0, 9).forEach(function (button) {
    if (!button || typeof button !== 'object') return;
    const label = cleanText(button.label, 80);
    if (!label) return;
    const style = ['primary', 'secondary', 'success', 'danger'].indexOf(button.style) !== -1 ? button.style : 'secondary';
    buttons.push({
      label: label,
      emoji: cleanText(button.emoji, 64) || '🎫',
      message: cleanText(button.message, 200) || 'Support request',
      style: style
    });
  });

  return buttons;
}

function sanitizeStaffQuestions(list) {
  const questions = [];
  if (!Array.isArray(list)) return questions;

  list.slice(0, 5).forEach(function (question) {
    if (!question || typeof question !== 'object') return;
    const label = cleanText(question.label, 45);
    if (!label) return;
    const style = question.style === 'paragraph' ? 'paragraph' : 'short';
    let maxLength = parseInt(question.maxLength, 10);
    if (isNaN(maxLength)) maxLength = style === 'paragraph' ? 500 : 100;
    maxLength = Math.max(1, Math.min(1000, maxLength));
    questions.push({
      label: label,
      placeholder: cleanText(question.placeholder, 100) || '',
      style: style,
      required: question.required !== false,
      maxLength: maxLength
    });
  });

  return questions;
}

function sanitizeSettings(guildId, input) {
  const current = db.getGuild(guildId);
  const body = input || {};
  const updates = {};

  if (typeof body.prefix === 'string') {
    const prefix = body.prefix.trim().slice(0, 5);
    if (prefix) updates.prefix = prefix;
  }

  if (['ban', 'kick', 'mute'].indexOf(body.punishment) !== -1) {
    updates.punishment = body.punishment;
  }

  if (['kick', 'ban'].indexOf(body.raidPunishment) !== -1) {
    updates.raidPunishment = body.raidPunishment;
  }

  if (body.antiNukeEnabled !== undefined) updates.antiNukeEnabled = Boolean(body.antiNukeEnabled);
  if (body.aiEnabled !== undefined) updates.aiEnabled = Boolean(body.aiEnabled);
  if (body.aiScanMessages !== undefined) updates.aiScanMessages = Boolean(body.aiScanMessages);

  if (typeof body.aiModel === 'string') {
    const model = body.aiModel.trim();
    updates.aiModel = model ? model.slice(0, 100) : null;
  } else if (body.aiModel === null) {
    updates.aiModel = null;
  }

  if (body.aiConfidence !== undefined) {
    const confidence = parseFloat(body.aiConfidence);
    if (!isNaN(confidence)) updates.aiConfidence = Math.max(0.3, Math.min(0.95, confidence));
  }

  if (['auto', 'ban', 'kick', 'timeout'].indexOf(body.aiAction) !== -1) {
    updates.aiAction = body.aiAction;
  }

  if (body.economyDaily !== undefined) {
    const daily = parseInt(body.economyDaily, 10);
    if (!isNaN(daily)) updates.economyDaily = Math.max(1, Math.min(100000, daily));
  }

  if (body.economyInvite !== undefined) {
    const invite = parseInt(body.economyInvite, 10);
    if (!isNaN(invite)) updates.economyInvite = Math.max(0, Math.min(100000, invite));
  }

  const idFields = [
    'logChannel',
    'autoRoleId',
    'autoRoleBotId',
    'boosterRoleId',
    'ticketCategory',
    'ticketLogChannel',
    'ticketStaffRole',
    'ticketPanelChannel',
    'applicationChannel',
    'staffApplyAcceptRole',
    'appealInviteChannel'
  ];
  idFields.forEach(function (field) {
    if (body[field] === undefined) return;
    const value = cleanId(body[field]);
    if (value === undefined) return;
    updates[field] = value;
  });

  const ticketTextFields = {
    ticketPanelTitle: 120,
    ticketPanelDescription: 4000,
    ticketPanelFooter: 300,
    ticketCreateLabel: 80,
    ticketCreateEmoji: 64
  };
  Object.keys(ticketTextFields).forEach(function (field) {
    if (body[field] !== undefined) updates[field] = cleanText(body[field], ticketTextFields[field]);
  });

  if (Array.isArray(body.ticketButtons)) {
    updates.ticketButtons = sanitizeTicketButtons(body.ticketButtons);
  }

  if (body.ticketAiEnabled !== undefined) updates.ticketAiEnabled = Boolean(body.ticketAiEnabled);

  if (typeof body.ticketNamePattern === 'string') {
    const pattern = body.ticketNamePattern.trim().slice(0, 100);
    updates.ticketNamePattern = pattern || 'ticket-{{ticket_number}}';
  }

  if (Array.isArray(body.ticketStaffRoles)) {
    updates.ticketStaffRoles = cleanIdList(body.ticketStaffRoles, 10);
  }

  if (Array.isArray(body.staffApplyAcceptRoles)) {
    updates.staffApplyAcceptRoles = cleanIdList(body.staffApplyAcceptRoles, 10);
  }

  if (body.warningKickThreshold !== undefined) {
    const threshold = parseInt(body.warningKickThreshold, 10);
    if (!isNaN(threshold)) updates.warningKickThreshold = Math.max(1, Math.min(20, threshold));
  }

  const staffTextFields = {
    staffApplyPanelTitle: 120,
    staffApplyPanelDescription: 4000,
    staffApplyPanelFooter: 300,
    staffApplyButtonLabel: 80,
    staffApplyButtonEmoji: 64,
    staffApplyModalTitle: 45,
    staffApplyAcceptMessage: 1000,
    staffApplyDenyMessage: 1000
  };
  Object.keys(staffTextFields).forEach(function (field) {
    if (body[field] !== undefined) updates[field] = cleanText(body[field], staffTextFields[field]);
  });

  if (Array.isArray(body.staffApplyQuestions)) {
    updates.staffApplyQuestions = sanitizeStaffQuestions(body.staffApplyQuestions);
  }

  const extraIdFields = [
    'verificationChannel',
    'verificationRole',
    'verificationLogChannel',
    'vouchLogChannel',
    'feedbackChannel',
    'customCommandRole',
    'inviteLogChannel',
    'nicknameLogChannel',
    'maintenanceChannelId',
    'maintenanceAnnouncementChannelId'
  ];
  extraIdFields.forEach(function (field) {
    if (body[field] === undefined) return;
    const value = cleanId(body[field]);
    if (value === undefined) return;
    updates[field] = value;
  });

  const booleanFields = [
    'verificationEnabled',
    'dmWarnings',
    'dmSecurity',
    'dmTicketUpdates',
    'dmFeedback',
    'ticketRatingsEnabled',
    'ticketPriorityEnabled'
  ];
  booleanFields.forEach(function (field) {
    if (body[field] !== undefined) updates[field] = Boolean(body[field]);
  });

  if (body.verificationRules !== undefined) updates.verificationRules = cleanText(body.verificationRules, 4000);
  if (['button', 'dm', 'channel'].indexOf(body.verificationMode) !== -1) {
    updates.verificationMode = body.verificationMode;
  }
  if (Array.isArray(body.verificationRoles)) updates.verificationRoles = cleanIdList(body.verificationRoles, 10);
  if (Array.isArray(body.maintenanceAllowedRoles)) updates.maintenanceAllowedRoles = cleanIdList(body.maintenanceAllowedRoles, 10);
  if (Array.isArray(body.ticketPriorities)) {
    updates.ticketPriorities = body.ticketPriorities.map(function (p) {
      return String(p || '').trim().slice(0, 20);
    }).filter(Boolean).slice(0, 8);
  }
  if (Array.isArray(body.bannedNickPatterns)) {
    updates.bannedNickPatterns = body.bannedNickPatterns.map(function (p) {
      return String(p || '').trim().slice(0, 120);
    }).filter(Boolean).slice(0, 20);
  }
  if (body.maintenanceMessage !== undefined) updates.maintenanceMessage = cleanText(body.maintenanceMessage, 2000);

  const growthIdFields = [
    'levelUpChannelId',
    'shopChannelId',
    'shopLogChannel',
    'serverAuditChannelId'
  ];
  growthIdFields.forEach(function (field) {
    if (body[field] === undefined) return;
    const value = cleanId(body[field]);
    if (value === undefined) return;
    updates[field] = value;
  });

  const growthBooleans = ['levelsEnabled', 'shopEnabled', 'serverAuditEnabled'];
  growthBooleans.forEach(function (field) {
    if (body[field] !== undefined) updates[field] = Boolean(body[field]);
  });

  const growthNumbers = {
    xpPerMessage: [0, 1000],
    xpMessageCooldown: [0, 86400],
    xpPerVoiceMinute: [0, 1000],
    coinsPerMessage: [0, 100000],
    coinsPerVoiceMinute: [0, 100000],
    coinsPerLevel: [0, 100000],
    serverAuditIntervalHours: [1, 720]
  };
  Object.keys(growthNumbers).forEach(function (field) {
    if (body[field] === undefined) return;
    const value = parseInt(body[field], 10);
    if (isNaN(value)) return;
    updates[field] = Math.max(growthNumbers[field][0], Math.min(growthNumbers[field][1], value));
  });

  if (Array.isArray(body.levelRewards)) {
    updates.levelRewards = body.levelRewards.map(function (reward) {
      const level = parseInt(reward && reward.level, 10);
      const roleId = cleanId(reward && reward.roleId);
      if (isNaN(level) || level < 1 || level > 500 || !roleId) return null;
      return {
        level: level,
        roleId: roleId,
        message: cleanText(reward.message, 300)
      };
    }).filter(Boolean).slice(0, 50).sort(function (a, b) {
      return a.level - b.level;
    });
  }

  if (body.levelUpMessage !== undefined) updates.levelUpMessage = cleanText(body.levelUpMessage, 500);

  if (body.serverAuditEnabled === true && !current.serverAuditEnabled) {
    updates.serverAuditLastAt = Date.now();
  }

  if (body.features && typeof body.features === 'object') {
    const features = Object.assign({}, current.features || {});
    Object.keys(body.features).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(features, key)) {
        features[key] = Boolean(body.features[key]);
      }
    });
    updates.features = features;
  }

  return updates;
}

function userLabel(userId) {
  if (!userId) return 'Unknown';
  if (botClient && botClient.users && botClient.users.cache) {
    const user = botClient.users.cache.get(userId);
    if (user) return user.tag || user.username || userId;
  }
  return String(userId);
}

function closedByStats(tickets) {
  const counts = {};
  tickets.forEach(function (ticket) {
    if (ticket.status !== 'closed' || !ticket.closedBy) return;
    if (!counts[ticket.closedBy]) counts[ticket.closedBy] = 0;
    counts[ticket.closedBy]++;
  });
  return Object.keys(counts).map(function (userId) {
    return { userId: userId, name: userLabel(userId), count: counts[userId] };
  }).sort(function (a, b) {
    return b.count - a.count;
  });
}

function activityPayload(guildId) {
  const tickets = db.getTickets(guildId).slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const applications = db.getStaffApplications(guildId).slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const appeals = db.getAppeals(guildId).slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const ticketStats = {
    total: tickets.length,
    open: tickets.filter(function (ticket) { return ticket.status === 'open'; }).length,
    closed: tickets.filter(function (ticket) { return ticket.status === 'closed'; }).length,
    closedBy: closedByStats(tickets)
  };

  const staffStats = {
    total: applications.length,
    pending: applications.filter(function (app) { return app.status === 'pending'; }).length,
    accepted: applications.filter(function (app) { return app.status === 'accepted'; }).length,
    denied: applications.filter(function (app) { return app.status === 'denied'; }).length,
    reviewedBy: (function () {
      const counts = {};
      applications.forEach(function (app) {
        if (!app.reviewedBy) return;
        if (!counts[app.reviewedBy]) counts[app.reviewedBy] = 0;
        counts[app.reviewedBy]++;
      });
      return Object.keys(counts).map(function (userId) {
        return { userId: userId, name: userLabel(userId), count: counts[userId] };
      }).sort(function (a, b) { return b.count - a.count; });
    })()
  };

  const appealStats = {
    total: appeals.length,
    pending: appeals.filter(function (appeal) { return appeal.status === 'pending'; }).length,
    approved: appeals.filter(function (appeal) { return appeal.status === 'approved'; }).length,
    denied: appeals.filter(function (appeal) { return appeal.status === 'denied'; }).length
  };

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCloses = {};
  tickets.forEach(function (ticket) {
    if (ticket.status !== 'closed' || !ticket.closedBy) return;
    if ((ticket.closedAt || 0) < cutoff) return;
    if (!recentCloses[ticket.closedBy]) recentCloses[ticket.closedBy] = 0;
    recentCloses[ticket.closedBy]++;
  });

  const advice = closedByStats(tickets).slice(0, 8).map(function (row) {
    const closes = recentCloses[row.userId] || 0;
    if (closes >= 3) {
      return {
        userId: row.userId,
        name: row.name,
        closes: closes,
        action: 'promote',
        reason: 'they closed ' + closes + ' tickets in the last 30 days'
      };
    }
    if (closes === 0) {
      return {
        userId: row.userId,
        name: row.name,
        closes: 0,
        action: 'demote',
        reason: 'they have not closed a ticket in the last 30 days'
      };
    }
    return {
      userId: row.userId,
      name: row.name,
      closes: closes,
      action: 'keep',
      reason: 'they are closing tickets steadily'
    };
  });

  const vouches = vouch.getVouches(guildId).slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const vouchLeaderboard = vouch.getVouchLeaderboard(guildId, 10);
  const ratings = Array.isArray(db.data.ticketRatings[guildId]) ? db.data.ticketRatings[guildId] : [];
  const ratingAverage = ratings.length
    ? Math.round((ratings.reduce(function (sum, r) { return sum + (r.stars || 0); }, 0) / ratings.length) * 10) / 10
    : 0;
  const staffMetrics = staffTracker.getAllStaffMetrics(guildId);
  const staffLeaderboard = staffTracker.getStaffLeaderboard(guildId, 10);
  const staffAdviceExtended = staffTracker.generateAdvice(guildId);
  const commands = customCommands.getCustomCommands(guildId);
  const rolePanels = reactionRoles.getReactionRoles(guildId);
  const ratingsEnabled = db.getGuild(guildId).ticketRatingsEnabled !== false;
  const priorityEnabled = db.getGuild(guildId).ticketPriorityEnabled === true;

  return {
    tickets: tickets.slice(0, 25),
    staffApplications: applications.slice(0, 25),
    appeals: appeals.slice(0, 25),
    ticketStats: ticketStats,
    staffStats: staffStats,
    appealStats: appealStats,
    staffAdvice: advice,
    vouches: vouches.slice(0, 25),
    vouchStats: {
      total: vouches.length,
      average: vouches.length
        ? Math.round((vouches.reduce(function (sum, v) { return sum + (v.stars || 0); }, 0) / vouches.length) * 10) / 10
        : 0,
      leaderboard: vouchLeaderboard
    },
    ticketRatings: {
      total: ratings.length,
      average: ratingAverage,
      recent: ratings.slice(-20).reverse(),
      enabled: ratingsEnabled,
      priorityEnabled: priorityEnabled
    },
    staffMetrics: staffMetrics,
    staffLeaderboard: staffLeaderboard,
    staffAdviceExtended: staffAdviceExtended,
    customCommands: commands,
    reactionRoles: rolePanels,
    inviteLeaderboard: enhancedInvites.getInviteLeaderboard(guildId, 'total', 10),
    maintenanceMode: db.getGuild(guildId).maintenanceMode === true,
    levelsLeaderboard: levels.getLeaderboard(guildId, 10),
    shopItems: shop.getItems(guildId),
    purchases: (db.data.purchases[guildId] || []).slice(-25).reverse(),
    healthReport: db.getGuild(guildId).serverAuditReport || null,
    integrations: integrations.list(guildId).map(function (item) {
      return {
        id: item.id,
        type: item.type,
        label: item.label,
        url: item.url,
        notes: item.notes,
        enabled: item.enabled,
        status: item.status,
        lastCheckedAt: item.lastCheckedAt,
        lastError: item.lastError,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    }),
    tempActions: tempActions.listActions(guildId),
    schedules: scheduler.listSchedules(guildId)
  };
}

async function staffRoleAction(guild, settings, body) {
  const action = String(body.action || '').toLowerCase();
  if (['promote', 'demote', 'remove'].indexOf(action) === -1) {
    throw new Error('Invalid staff action.');
  }

  const userId = cleanId(body.userId);
  if (!userId) throw new Error('A valid member ID is required.');

  const member = await guild.members.fetch(userId).catch(function () {
    return null;
  });
  if (!member) throw new Error('That member is not in this server.');

  const roleIds = [];
  if (action === 'remove') {
    ticketAssistant.roleIds(settings).forEach(function (roleId) {
      if (roleIds.indexOf(roleId) === -1) roleIds.push(roleId);
    });
  } else {
    const roleId = cleanId(body.roleId);
    if (!roleId) throw new Error('A valid role ID is required.');
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(function () {
      return null;
    });
    if (!role) throw new Error('That role was not found.');
    roleIds.push(role.id);
  }

  const changed = [];
  for (let i = 0; i < roleIds.length; i++) {
    const role = guild.roles.cache.get(roleIds[i]);
    if (!role || !role.editable) continue;
    if (action === 'promote') {
      await member.roles.add(role, 'Staff review: promoted').catch(function () {});
      changed.push(role.name);
    } else {
      await member.roles.remove(role, 'Staff review: demoted').catch(function () {});
      changed.push(role.name);
    }
  }

  const logId = settings.logChannel || settings.ticketLogChannel || guild.systemChannelId;
  const channel = logId ? guild.channels.cache.get(logId) : null;
  if (channel) {
    const { EmbedBuilder } = require('discord.js');
    channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(action === 'promote' ? 0x57F287 : 0xFEE75C)
          .setTitle(action === 'promote' ? 'Staff Promoted' : (action === 'remove' ? 'Staff Removed' : 'Staff Demoted'))
          .setDescription(
            (action === 'promote' ? 'Promoted ' : (action === 'remove' ? 'Removed ' : 'Demoted ')) +
            member + (changed.length ? ' with ' + changed.join(', ') : '') + '.' +
            (action === 'promote' ? '\n\nWell done! Keep helping the community.' : '')
          )
          .setTimestamp()
      ]
    }).catch(function () {});
  }

  return { memberId: member.id, action: action, roles: changed };
}

function statusPayload() {
  return {
    ok: true,
    service: 'zyron-bot-api',
    enabled: ENABLED,
    running: Boolean(server && server.listening),
    host: HOST,
    port: PORT,
    bot: botClient && botClient.user ? botClient.user.tag : null,
    botId: botClient && botClient.user ? botClient.user.id : null,
    guilds: botClient && botClient.guilds && botClient.guilds.cache ? botClient.guilds.cache.size : 0,
    uptimeMs: startedAt ? Date.now() - startedAt : 0,
    publicUrl: PUBLIC_URL,
    dashboardUrl: DASHBOARD_URL,
    keyConfigured: Boolean(API_KEY),
    lastHeartbeat: lastHeartbeat,
    requestCount: requestCount
  };
}

async function handle(req, res) {
  requestCount++;
  applyCors(req, res);

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/ping') {
    return json(res, 200, { ok: true, service: 'zyron-bot-api', time: Date.now() });
  }

  if (pathname.indexOf('/api/') !== 0) {
    return json(res, 404, { ok: false, error: 'Not found.' });
  }

  if (!isAuthorized(req, url)) {
    return json(res, 401, { ok: false, error: 'Invalid or missing API key.' });
  }

  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/api/link-status')) {
    return json(res, 200, statusPayload());
  }

  if (req.method === 'POST' && pathname === '/api/heartbeat') {
    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    lastHeartbeat = {
      at: Date.now(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      dashboardUrl: body.dashboardUrl || '',
      version: body.version || ''
    };

    console.log('[WebBridge] Dashboard heartbeat from ' + lastHeartbeat.ip +
      (lastHeartbeat.dashboardUrl ? ' (' + lastHeartbeat.dashboardUrl + ')' : ''));

    return json(res, 200, Object.assign({ linked: true }, statusPayload()));
  }

  if (req.method === 'GET' && pathname === '/api/guilds') {
    return json(res, 200, { ok: true, guilds: getGuildList() });
  }

  if (req.method === 'GET' && pathname === '/api/meta') {
    return json(res, 200, {
      ok: true,
      coOwners: db.getCoOwners(),
      version: '1.0.0',
      dbPath: 'bot-managed',
      bot: statusPayload()
    });
  }

  const activityMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/activity$/);
  if (activityMatch) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = activityMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId)
      : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    return json(res, 200, { ok: true, activity: activityPayload(guildId) });
  }

  const appealMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/appeals\/([A-Za-z0-9]+)\/review$/);
  if (appealMatch) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = appealMatch[1];
    const caseId = appealMatch[2];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId)
      : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    if (['approve', 'deny'].indexOf(String(body.action || '').toLowerCase()) === -1) {
      return json(res, 400, { ok: false, error: 'Action must be approve or deny.' });
    }

    try {
      const settings = db.getGuild(guildId);
      const appeal = await appealUtil.reviewAppeal(
        guild,
        settings,
        caseId,
        String(body.action).toLowerCase(),
        body.reviewerId ? String(body.reviewerId) : null
      );
      return json(res, 200, { ok: true, appeal: appeal });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
  }

  const staffActionMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/staff\/action$/);
  if (staffActionMatch) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = staffActionMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId)
      : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    try {
      const settings = db.getGuild(guildId);
      const result = await staffRoleAction(guild, settings, body);
      return json(res, 200, { ok: true, result: result });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
  }

  const customCommandMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/custom-commands(?:\/([A-Za-z0-9]+))?$/);
  if (customCommandMatch) {
    const guildId = customCommandMatch[1];
    const commandId = customCommandMatch[2] || null;
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET' && !commandId) {
      return json(res, 200, { ok: true, commands: customCommands.getCustomCommands(guildId) });
    }

    let body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && !commandId) {
      const name = String(body.name || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32);
      if (!name) return json(res, 400, { ok: false, error: 'A command name is required.' });
      if (customCommands.getCustomCommand(guildId, name)) {
        return json(res, 400, { ok: false, error: 'A custom command with that name already exists.' });
      }
      const response = String(body.response || '').slice(0, 2000);
      if (!response && (!body.embed || !body.embed.description)) {
        return json(res, 400, { ok: false, error: 'A response or embed description is required.' });
      }
      const created = customCommands.addCustomCommand(guildId, {
        name: name,
        response: response,
        type: body.type === 'embed' ? 'embed' : 'text',
        embed: body.embed || null,
        cooldown: body.cooldown,
        allowedRoles: body.allowedRoles,
        allowedChannels: body.allowedChannels,
        createdBy: body.createdBy || null
      });
      return json(res, 200, { ok: true, command: created });
    }

    if (req.method === 'PATCH' && commandId) {
      const updates = {};
      if (body.response !== undefined) updates.response = String(body.response || '').slice(0, 2000);
      if (body.type !== undefined) updates.type = body.type === 'embed' ? 'embed' : 'text';
      if (body.embed !== undefined) updates.embed = body.embed || null;
      if (body.cooldown !== undefined) updates.cooldown = Math.max(0, parseInt(body.cooldown, 10) || 0);
      if (Array.isArray(body.allowedRoles)) updates.allowedRoles = cleanIdList(body.allowedRoles, 10);
      if (Array.isArray(body.allowedChannels)) updates.allowedChannels = cleanIdList(body.allowedChannels, 10);
      const updated = customCommands.updateCustomCommand(guildId, commandId, updates);
      if (!updated) return json(res, 404, { ok: false, error: 'Command not found.' });
      return json(res, 200, { ok: true, command: updated });
    }

    if (req.method === 'DELETE' && commandId) {
      const deleted = customCommands.deleteCustomCommand(guildId, commandId);
      if (!deleted) return json(res, 404, { ok: false, error: 'Command not found.' });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const reactionRolePublishMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/reaction-roles\/([A-Za-z0-9]+)\/publish$/);
  if (reactionRolePublishMatch) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = reactionRolePublishMatch[1];
    const panelId = reactionRolePublishMatch[2];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    const panel = reactionRoles.getReactionRole(guildId, panelId);
    if (!panel) return json(res, 404, { ok: false, error: 'Role panel not found.' });
    const channel = guild.channels.cache.get(panel.channelId);
    if (!channel) return json(res, 404, { ok: false, error: 'Panel channel not found.' });
    const message = await reactionRoles.sendReactionRolePanel(channel, panel, guild);
    return json(res, 200, { ok: true, messageId: message ? message.id : null });
  }

  const reactionRoleMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/reaction-roles(?:\/([A-Za-z0-9]+))?$/);
  if (reactionRoleMatch) {
    const guildId = reactionRoleMatch[1];
    const panelId = reactionRoleMatch[2] || null;
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET' && !panelId) {
      return json(res, 200, { ok: true, panels: reactionRoles.getReactionRoles(guildId) });
    }

    let body = {};
    if (req.method === 'POST') {
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && !panelId) {
      const channelId = cleanId(body.channelId);
      const roleId = cleanId(body.roleId);
      if (!channelId || !roleId) return json(res, 400, { ok: false, error: 'Channel and role are required.' });
      const created = reactionRoles.addReactionRole(guildId, {
        channelId: channelId,
        roleId: roleId,
        type: body.type === 'dropdown' ? 'dropdown' : 'button',
        label: String(body.label || '').slice(0, 80) || null,
        emoji: String(body.emoji || '').slice(0, 64) || null,
        description: String(body.description || '').slice(0, 500) || null,
        maxRoles: Math.max(0, parseInt(body.maxRoles, 10) || 0),
        createdBy: body.createdBy || null
      });
      let message = null;
      const channel = guild.channels.cache.get(channelId);
      if (channel) message = await reactionRoles.sendReactionRolePanel(channel, created, guild);
      return json(res, 200, { ok: true, panel: created, messageId: message ? message.id : null });
    }

    if (req.method === 'DELETE' && panelId) {
      const deleted = reactionRoles.deleteReactionRole(guildId, panelId);
      if (!deleted) return json(res, 404, { ok: false, error: 'Role panel not found.' });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const verificationMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/verification$/);
  if (verificationMatch) {
    const guildId = verificationMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET') {
      const settings = db.getGuild(guildId);
      return json(res, 200, {
        ok: true,
        verification: {
          enabled: settings.verificationEnabled === true,
          channelId: settings.verificationChannel || null,
          roleId: settings.verificationRole || null,
          rules: settings.verificationRules || null,
          mode: settings.verificationMode || 'button'
        }
      });
    }

    if (req.method === 'POST') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
      const channelId = cleanId(body.channelId);
      const roleId = cleanId(body.roleId);
      const rules = String(body.rules || '').slice(0, 4000);
      if (!channelId || !roleId || !rules) {
        return json(res, 400, { ok: false, error: 'Channel, role and rules are required.' });
      }
      await verification.setupVerification(
        guild,
        db.getGuild(guildId),
        channelId,
        roleId,
        rules,
        cleanId(body.logChannelId) || null,
        Array.isArray(body.questions) ? body.questions : []
      );
      db.updateGuild(guildId, {
        verificationMode: ['button', 'dm', 'channel'].indexOf(body.mode) !== -1 ? body.mode : 'button',
        verificationEnabled: body.enabled !== false
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const maintenanceMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/maintenance$/);
  if (maintenanceMatch) {
    const guildId = maintenanceMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET') {
      const settings = db.getGuild(guildId);
      return json(res, 200, {
        ok: true,
        maintenance: {
          enabled: settings.maintenanceMode === true,
          message: settings.maintenanceMessage,
          channelId: settings.maintenanceChannelId,
          announcementChannelId: settings.maintenanceAnnouncementChannelId
        }
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });

    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    const settings = db.getGuild(guildId);
    if (body.enabled === true) {
      if (settings.maintenanceMode) return json(res, 400, { ok: false, error: 'Maintenance mode is already active.' });
      const result = await maintenance.enableMaintenanceMode(guild, settings, body.startedBy || null, {
        message: body.message || settings.maintenanceMessage,
        allowedRoles: cleanIdList(body.allowedRoles || [], 10)
      });
      return json(res, 200, { ok: true, result: {
        channelId: result.maintenanceChannel ? result.maintenanceChannel.id : null,
        announcementChannelId: result.announcementChannel ? result.announcementChannel.id : null
      } });
    }

    if (body.enabled === false) {
      await maintenance.disableMaintenanceMode(guild, settings);
      return json(res, 200, { ok: true });
    }

    if (body.announce) {
      await maintenance.sendMaintenanceAnnouncement(guild, settings, String(body.announce).slice(0, 2000), body.authorId || null);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'Provide enabled: true/false or an announcement.' });
  }

  const purgeMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/purge$/);
  if (purgeMatch) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = purgeMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
    const channel = guild.channels.cache.get(cleanId(body.channelId) || '');
    if (!channel) return json(res, 404, { ok: false, error: 'Channel not found.' });
    const result = await advancedPurge.advancedPurge(channel, body.options || {}, body.executor || { id: 'dashboard', tag: 'Dashboard' });
    if (result.logEmbed) {
      const settings = db.getGuild(guildId);
      const logChannel = guild.channels.cache.get(settings.logChannel || '');
      if (logChannel) logChannel.send({ embeds: [result.logEmbed] }).catch(function () {});
    }
    return json(res, 200, { ok: true, deleted: result.deleted, filtered: result.filtered });
  }

  const nicknameMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/nickname$/);
  if (nicknameMatch) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guildId = nicknameMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    let body = {};
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
    const member = await guild.members.fetch(cleanId(body.userId) || '').catch(function () { return null; });
    if (!member) return json(res, 404, { ok: false, error: 'Member not found.' });
    const result = body.reset
      ? await nicknameUtil.resetNickname(member, 'Dashboard reset', body.executorId || null)
      : await nicknameUtil.setNickname(member, body.nickname || '', 'Dashboard change', body.executorId || null);
    if (!result.success) return json(res, 400, { ok: false, error: result.reason });
    return json(res, 200, { ok: true, result: result });
  }

  const channelListMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/channels$/);
  if (channelListMatch) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guild = botClient.guilds.cache.get(channelListMatch[1]);
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    const channels = guild.channels.cache
      .filter(function (c) { return [0, 2, 4, 5].indexOf(c.type) !== -1; })
      .map(function (c) { return { id: c.id, name: c.name, type: c.type, parentId: c.parentId || null }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    return json(res, 200, { ok: true, channels: channels });
  }

  const roleListMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/roles$/);
  if (roleListMatch) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    const guild = botClient.guilds.cache.get(roleListMatch[1]);
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    const roles = guild.roles.cache
      .filter(function (r) { return r.id !== guild.id && !r.managed; })
      .map(function (r) { return { id: r.id, name: r.name, color: r.hexColor, position: r.position }; })
      .sort(function (a, b) { return b.position - a.position; });
    return json(res, 200, { ok: true, roles: roles });
  }

  const levelsMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/levels$/);
  if (levelsMatch) {
    const guildId = levelsMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        settings: summarizeSettings(db.getGuild(guildId)),
        leaderboard: levels.getLeaderboard(guildId, 10)
      });
    }

    if (req.method === 'PATCH') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
      const updates = sanitizeSettings(guildId, body);
      const settings = db.updateGuild(guildId, updates);
      return json(res, 200, { ok: true, settings: summarizeSettings(settings) });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const shopMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/shop(?:\/([A-Za-z0-9]+))?$/);
  if (shopMatch) {
    const guildId = shopMatch[1];
    const itemId = shopMatch[2] || null;
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET' && !itemId) {
      return json(res, 200, {
        ok: true,
        items: shop.getItems(guildId),
        purchases: (db.data.purchases[guildId] || []).slice(-25).reverse(),
        settings: summarizeSettings(db.getGuild(guildId))
      });
    }

    let body = {};
    if (req.method === 'POST' || req.method === 'PATCH') {
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
    }

    try {
      if (req.method === 'POST' && !itemId) {
        const item = shop.addItem(guildId, body.item || body);
        return json(res, 200, { ok: true, item: item });
      }
      if (req.method === 'PATCH' && itemId) {
        const item = shop.updateItem(guildId, itemId, body.item || body);
        return json(res, 200, { ok: true, item: item });
      }
      if (req.method === 'DELETE' && itemId) {
        const removed = shop.deleteItem(guildId, itemId);
        if (!removed) return json(res, 404, { ok: false, error: 'Shop item not found.' });
        return json(res, 200, { ok: true });
      }
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const healthMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/health(?:\/(run))?$/);
  if (healthMatch) {
    const guildId = healthMatch[1];
    const runNow = healthMatch[2] === 'run' || req.method === 'POST';
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (!runNow && req.method === 'GET') {
      const settings = db.getGuild(guildId);
      return json(res, 200, {
        ok: true,
        report: settings.serverAuditReport || null,
        settings: summarizeSettings(settings)
      });
    }

    if (runNow) {
      try {
        const settings = db.getGuild(guildId);
        const report = await serverAudit.runAndStore(guild, settings, true);
        return json(res, 200, { ok: true, report: report });
      } catch (err) {
        return json(res, 500, { ok: false, error: err.message });
      }
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const integrationsTestMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/integrations\/([A-Za-z0-9]+)\/test$/);
  if (integrationsTestMatch) {
    const guildId = integrationsTestMatch[1];
    const integrationId = integrationsTestMatch[2];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });

    try {
      const item = await integrations.test(guildId, integrationId);
      return json(res, 200, { ok: true, integration: item });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
  }

  const integrationsMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/integrations(?:\/([A-Za-z0-9]+))?$/);
  if (integrationsMatch) {
    const guildId = integrationsMatch[1];
    const integrationId = integrationsMatch[2] || null;
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });

    if (req.method === 'GET' && !integrationId) {
      const items = integrations.list(guildId).map(function (item) {
        return {
          id: item.id,
          type: item.type,
          label: item.label,
          url: item.url,
          notes: item.notes,
          enabled: item.enabled,
          status: item.status,
          lastCheckedAt: item.lastCheckedAt,
          lastError: item.lastError,
          hasApiKey: Boolean(item.apiKey),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        };
      });
      return json(res, 200, {
        ok: true,
        integrations: items,
        types: integrations.INTEGRATION_TYPES
      });
    }

    let body = {};
    if (req.method === 'POST' || req.method === 'PATCH') {
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }
    }

    try {
      if (req.method === 'POST' && !integrationId) {
        const item = integrations.add(guildId, body.integration || body);
        return json(res, 200, { ok: true, integration: item });
      }
      if (req.method === 'PATCH' && integrationId) {
        const item = integrations.update(guildId, integrationId, body.integration || body);
        return json(res, 200, { ok: true, integration: item });
      }
      if (req.method === 'DELETE' && integrationId) {
        const removed = integrations.remove(guildId, integrationId);
        if (!removed) return json(res, 404, { ok: false, error: 'Integration not found.' });
        return json(res, 200, { ok: true });
      }
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const tempActionsMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/temp-actions$/);
  if (tempActionsMatch) {
    const guildId = tempActionsMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    return json(res, 200, { ok: true, actions: tempActions.listActions(guildId) });
  }

  const schedulesMatch = pathname.match(/^\/api\/guilds\/(\d{5,25})\/schedules$/);
  if (schedulesMatch) {
    const guildId = schedulesMatch[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId) : null;
    if (!guild) return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed.' });
    return json(res, 200, { ok: true, schedules: scheduler.listSchedules(guildId) });
  }

  const match = pathname.match(/^\/api\/guilds\/(\d{5,25})\/settings$/);
  if (match) {
    const guildId = match[1];
    const guild = botClient && botClient.guilds && botClient.guilds.cache
      ? botClient.guilds.cache.get(guildId)
      : null;

    if (!guild) {
      return json(res, 404, { ok: false, error: 'The bot is not in that server.' });
    }

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, settings: summarizeSettings(db.getGuild(guildId)) });
    }

    if (req.method === 'PATCH') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (err) {
        return json(res, 400, { ok: false, error: err.message });
      }

      const updates = sanitizeSettings(guildId, body);
      const settings = db.updateGuild(guildId, updates);
      return json(res, 200, { ok: true, settings: summarizeSettings(settings) });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  return json(res, 404, { ok: false, error: 'Not found.' });
}

function start(client) {
  botClient = client;

  if (!ENABLED) {
    console.log('[WebBridge] Bot API disabled. Set BOT_API_ENABLED=true and BOT_API_KEY to enable it.');
    return null;
  }

  if (!API_KEY) {
    console.error('[WebBridge] BOT_API_KEY is missing. Bot API not started.');
    return null;
  }

  if (server) return server;

  server = http.createServer(function (req, res) {
    handle(req, res).catch(function (err) {
      console.error('[WebBridge] Request failed:', err.message);
      if (!res.headersSent) {
        json(res, 500, { ok: false, error: 'Internal API error.' });
      } else {
        res.end();
      }
    });
  });

  server.on('error', function (err) {
    console.error('[WebBridge] API server error: ' + err.message);
  });

  server.listen(PORT, HOST, function () {
    startedAt = Date.now();
    console.log('[WebBridge] Bot API listening on ' + HOST + ':' + PORT);
    if (PUBLIC_URL) console.log('[WebBridge] Public API URL: ' + PUBLIC_URL);
  });

  return server;
}

function stop() {
  if (!server) return;
  try {
    server.close();
  } catch (err) {
    // ignore shutdown errors
  }
  server = null;
  startedAt = 0;
}

function checkDashboard() {
  if (!DASHBOARD_URL) {
    return Promise.resolve({ ok: false, error: 'DASHBOARD_URL is not set in the bot .env.' });
  }

  let target;
  try {
    target = new URL('/healthz', DASHBOARD_URL);
  } catch (err) {
    return Promise.resolve({ ok: false, error: 'DASHBOARD_URL is not a valid URL.' });
  }

  const lib = target.protocol === 'https:' ? https : http;

  return new Promise(function (resolve) {
    const request = lib.get(target, { timeout: 5000 }, function (response) {
      let text = '';
      response.on('data', function (chunk) { text += chunk; });
      response.on('end', function () {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          body: text.slice(0, 300)
        });
      });
    });

    request.on('timeout', function () {
      request.destroy(new Error('Dashboard check timed out.'));
    });

    request.on('error', function (err) {
      resolve({ ok: false, error: err.message });
    });
  });
}

module.exports = {
  start: start,
  stop: stop,
  getStatus: statusPayload,
  checkDashboard: checkDashboard,
  isEnabled: ENABLED
};
