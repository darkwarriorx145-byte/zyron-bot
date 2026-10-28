const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('../database/db');
const appealUtil = require('../utils/appeal');
const ticketAssistant = require('../utils/ticketAssistant');

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

  return {
    tickets: tickets.slice(0, 25),
    staffApplications: applications.slice(0, 25),
    appeals: appeals.slice(0, 25),
    ticketStats: ticketStats,
    staffStats: staffStats,
    appealStats: appealStats,
    staffAdvice: advice
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
