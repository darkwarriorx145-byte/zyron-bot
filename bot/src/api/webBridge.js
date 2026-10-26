const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('../database/db');

const API_KEY = process.env.BOT_API_KEY || process.env.ZYRON_API_KEY || '';
const ENABLED = String(process.env.BOT_API_ENABLED || '').toLowerCase() === 'true' || Boolean(API_KEY);
const HOST = process.env.BOT_API_HOST || '0.0.0.0';
const PORT = parseInt(process.env.BOT_API_PORT || '4000', 10) || 4000;
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

  const idFields = ['logChannel', 'autoRoleId', 'autoRoleBotId', 'boosterRoleId'];
  idFields.forEach(function (field) {
    if (body[field] === undefined) return;
    const value = body[field] === null ? '' : String(body[field]).trim();
    if (!value) {
      updates[field] = null;
    } else if (/^\d{5,25}$/.test(value)) {
      updates[field] = value;
    }
  });

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
