const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cookieSession = require('cookie-session');
const fs = require('fs');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const botApi = require('./lib/botApi');

const app = express();

const PORT = process.env.DASHBOARD_PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'ZyronDashboardSecretKey2026';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || ('http://localhost:' + PORT + '/auth/discord/callback');
const MAIN_ADMIN_ID = String(process.env.MAIN_ADMIN_DISCORD_ID || '');
const OAUTH_READY = Boolean(CLIENT_ID && CLIENT_SECRET);
const SECURE_COOKIES = String(process.env.DASHBOARD_SECURE_COOKIES || '').toLowerCase() === 'true';
const INVITE_URL = 'https://discord.gg/NptArpkjK';
const REMOTE_MODE = botApi.isConfigured();

function oauthCallbackUrl(req) {
  const host = req.get('host') || ('localhost:' + PORT);
  return req.protocol + '://' + host + '/auth/discord/callback';
}

const BASE_FEATURES = {
  antiBan: true,
  antiKick: true,
  antiBotAdd: true,
  antiChannelCreate: true,
  antiChannelDelete: true,
  antiChannelUpdate: true,
  antiRoleCreate: true,
  antiRoleDelete: true,
  antiRoleUpdate: true,
  antiWebhook: true,
  antiEveryone: true,
  antiGuildUpdate: true,
  antiIntegration: true,
  antiMemberUpdate: true,
  antiPrune: true,
  antiDangerousPermissionUpdate: true,
  antiSpam: true,
  antiLink: true,
  antiChannelRecovery: true,
  antiBetrayal: true,
  antiAbuse: true,
  antiRaid: true,
  autoLockdown: true,
  autoMod: true
};

const FEATURE_CATALOG = [
  { key: 'antiBan', label: 'Anti Ban', description: 'Revert unauthorized bans.', group: 'security' },
  { key: 'antiKick', label: 'Anti Kick', description: 'Revert unauthorized kicks.', group: 'security' },
  { key: 'antiBotAdd', label: 'Anti Bot Add', description: 'Block unauthorized bots.', group: 'security' },
  { key: 'antiChannelCreate', label: 'Anti Channel Create', description: 'Delete unauthorized channels.', group: 'security' },
  { key: 'antiChannelDelete', label: 'Anti Channel Delete', description: 'Restore deleted channels.', group: 'security' },
  { key: 'antiChannelUpdate', label: 'Anti Channel Update', description: 'Revert channel edits.', group: 'security' },
  { key: 'antiRoleCreate', label: 'Anti Role Create', description: 'Delete unauthorized roles.', group: 'security' },
  { key: 'antiRoleDelete', label: 'Anti Role Delete', description: 'Restore deleted roles.', group: 'security' },
  { key: 'antiRoleUpdate', label: 'Anti Role Update', description: 'Revert role edits.', group: 'security' },
  { key: 'antiWebhook', label: 'Anti Webhook', description: 'Delete unauthorized webhooks.', group: 'security' },
  { key: 'antiGuildUpdate', label: 'Anti Guild Update', description: 'Revert server name and icon changes.', group: 'security' },
  { key: 'antiIntegration', label: 'Anti Integration', description: 'Block unauthorized integrations.', group: 'security' },
  { key: 'antiMemberUpdate', label: 'Anti Member Update', description: 'Revert dangerous role grants.', group: 'security' },
  { key: 'antiPrune', label: 'Anti Prune', description: 'Block mass member pruning.', group: 'security' },
  { key: 'antiDangerousPermissionUpdate', label: 'Anti Dangerous Permissions', description: 'Revert Administrator grants.', group: 'security' },
  { key: 'antiEveryone', label: 'Anti Everyone', description: 'Block @everyone and mass mentions.', group: 'chat' },
  { key: 'antiSpam', label: 'Anti Spam', description: 'Stop message floods.', group: 'chat' },
  { key: 'antiLink', label: 'Anti Link', description: 'Remove unauthorized links.', group: 'chat' },
  { key: 'antiAbuse', label: 'Anti Abuse', description: 'Profanity and harassment filter.', group: 'chat' },
  { key: 'antiChannelRecovery', label: 'Anti Channel Recovery', description: 'Restore nuked channels.', group: 'recovery' },
  { key: 'antiBetrayal', label: 'Anti Betrayal', description: 'Punish rogue trusted users.', group: 'recovery' },
  { key: 'antiRaid', label: 'Anti Raid', description: 'Lock down mass joins.', group: 'recovery' },
  { key: 'autoLockdown', label: 'Auto Lockdown', description: 'Lock the server when a threat is confirmed.', group: 'recovery' },
  { key: 'autoMod', label: 'Discord AutoMod', description: 'Native keyword and mention rules.', group: 'recovery' }
];

const FEATURE_GROUPS = [
  { key: 'security', label: 'Server & Role Security', description: 'Reverts and blocks destructive staff actions.' },
  { key: 'chat', label: 'Chat Filters', description: 'Keeps conversations clean and stops spam.' },
  { key: 'recovery', label: 'Recovery & Automation', description: 'Backups, raids and automatic lockdowns.' }
];

function loadBotConfig() {
  const candidates = [
    path.join(__dirname, '..', 'bot', 'config.json'),
    path.join(__dirname, '..', 'config.json')
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i])) {
        return JSON.parse(fs.readFileSync(candidates[i], 'utf8'));
      }
    } catch (err) {
      // ignore and try the next location
    }
  }
  return null;
}

const BOT_CONFIG = loadBotConfig();

function resolveDbPath() {
  if (process.env.BOT_DB_PATH) return path.resolve(process.env.BOT_DB_PATH);

  const botLayout = path.join(__dirname, '..', 'bot', 'data', 'database.json');
  const flatLayout = path.join(__dirname, '..', 'data', 'database.json');

  if (fs.existsSync(botLayout)) return botLayout;
  if (fs.existsSync(flatLayout)) return flatLayout;

  if (fs.existsSync(path.join(__dirname, '..', 'bot'))) return botLayout;
  return flatLayout;
}

const DB_PATH = resolveDbPath();

function emptyDb() {
  return {
    guilds: {},
    warnings: {},
    channels: {},
    coins: {},
    messages: {},
    invites: {},
    inviteMembers: {},
    coOwners: [],
    lockdowns: {},
    cooldowns: {}
  };
}

function readBotDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return Object.assign(emptyDb(), parsed);
    }
  } catch (err) {
    console.error('Failed to read bot DB:', err.message);
  }
  return emptyDb();
}

function writeBotDB(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = DB_PATH + '.' + process.pid + '.' + Date.now() + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, DB_PATH);
    } catch (renameErr) {
      fs.copyFileSync(tempPath, DB_PATH);
      try { fs.unlinkSync(tempPath); } catch (cleanupErr) {}
    }
    return true;
  } catch (err) {
    console.error('Failed to write bot DB:', err.message);
    return false;
  }
}

function defaultFeatures() {
  const base = Object.assign({}, BASE_FEATURES);
  if (BOT_CONFIG && BOT_CONFIG.defaultSettings && BOT_CONFIG.defaultSettings.features) {
    return Object.assign(base, BOT_CONFIG.defaultSettings.features);
  }
  return base;
}

function defaultGuild() {
  return {
    prefix: (BOT_CONFIG && BOT_CONFIG.prefix) || '.',
    antiNukeEnabled: true,
    punishment: 'ban',
    raidPunishment: 'kick',
    logChannel: null,
    autoRoleId: null,
    autoRoleBotId: null,
    boosterRoleId: null,
    aiEnabled: true,
    aiModel: null,
    aiScanMessages: true,
    aiConfidence: 0.6,
    aiAction: 'auto',
    economyDaily: 100,
    economyInvite: 25,
    extraOwners: [],
    whitelist: [],
    featureWhitelist: {},
    betrayed: [],
    lockdown: null,
    features: defaultFeatures()
  };
}

function normalizeGuild(guild) {
  const base = defaultGuild();
  const current = guild || {};
  const merged = Object.assign({}, base, current);
  merged.features = Object.assign({}, base.features, current.features || {});
  if (merged.aiModel === undefined) merged.aiModel = null;
  if (merged.aiConfidence === undefined) merged.aiConfidence = 0.6;
  if (merged.aiAction === undefined) merged.aiAction = 'auto';
  return merged;
}

let botGuildCache = { at: 0, map: null, source: 'none' };
let botApiReachable = false;

async function fetchBotGuildsFromDiscord() {
  const token = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '';
  if (!token) return null;

  try {
    const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: 'Bot ' + token },
      timeout: 10000
    });
    const map = {};
    (response.data || []).forEach(function (guild) {
      map[guild.id] = {
        id: guild.id,
        name: guild.name,
        icon: guild.icon || null
      };
    });
    return map;
  } catch (err) {
    console.error('Bot guild lookup failed:', err.message);
    return null;
  }
}

function readBotGuildsFromDB() {
  try {
    const data = readBotDB();
    const map = {};
    Object.keys(data.guilds || {}).forEach(function (id) {
      map[id] = { id: id, name: 'Server ' + id, icon: null };
    });
    return map;
  } catch (err) {
    console.error('Bot DB guild lookup failed:', err.message);
    return null;
  }
}

async function getBotGuilds() {
  const ttl = REMOTE_MODE && botGuildCache.source !== 'api' ? 15000 : 60000;
  if (botGuildCache.map && Date.now() - botGuildCache.at < ttl) {
    return botGuildCache.map;
  }

  if (REMOTE_MODE) {
    try {
      const result = await botApi.getGuilds();
      const list = result.guilds || [];
      const map = {};

      list.forEach(function (guild) {
        map[guild.id] = {
          id: guild.id,
          name: guild.name,
          icon: guild.icon || null,
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
          settings: guild.settings || null
        };
      });

      botApiReachable = true;
      botGuildCache = { at: Date.now(), map: map, source: 'api' };
      return map;
    } catch (err) {
      botApiReachable = false;
      console.error('Bot API guild lookup failed:', err.message);

      const discordMap = await fetchBotGuildsFromDiscord();
      if (discordMap) {
        botGuildCache = { at: Date.now(), map: discordMap, source: 'discord' };
        return discordMap;
      }

      const dbMap = readBotGuildsFromDB();
      if (dbMap) {
        botGuildCache = { at: Date.now(), map: dbMap, source: 'database' };
        return dbMap;
      }

      if (botGuildCache.map) return botGuildCache.map;
      return {};
    }
  }

  const discordMap = await fetchBotGuildsFromDiscord();
  if (discordMap) {
    botApiReachable = true;
    botGuildCache = { at: Date.now(), map: discordMap, source: 'discord' };
    return discordMap;
  }

  const dbMap = readBotGuildsFromDB() || {};
  botApiReachable = true;
  botGuildCache = { at: Date.now(), map: dbMap, source: 'database' };
  return dbMap;
}

async function loadGuildSettings(guildId) {
  if (REMOTE_MODE) {
    try {
      const result = await botApi.getSettings(guildId);
      return normalizeGuild(result.settings);
    } catch (err) {
      if (fs.existsSync(DB_PATH)) {
        const local = readBotDB();
        if (local.guilds && local.guilds[guildId]) {
          console.warn('Bot API settings lookup failed; using local bot DB:', err.message);
          return normalizeGuild(local.guilds[guildId]);
        }
      }
      throw err;
    }
  }
  return normalizeGuild(readBotDB().guilds[guildId]);
}

async function saveGuildSettings(guildId, updates) {
  if (REMOTE_MODE) {
    const result = await botApi.updateSettings(guildId, updates);
    return normalizeGuild(result.settings);
  }

  const latest = readBotDB();
  const latestExisting = normalizeGuild(latest.guilds[guildId]);
  const merged = normalizeGuild(Object.assign({}, latestExisting, updates));
  merged.features = Object.assign({}, latestExisting.features, updates.features || {});
  latest.guilds[guildId] = merged;

  if (!writeBotDB(latest)) {
    throw new Error('Could not write the bot database.');
  }

  return merged;
}

function isMainAdmin(user) {
  if (!user || !user.id) return false;
  if (!MAIN_ADMIN_ID) return false;
  return String(user.id) === MAIN_ADMIN_ID;
}

function hasManagePermission(permissions) {
  try {
    const bits = BigInt(permissions || '0');
    const administrator = BigInt(8);
    const manageGuild = BigInt(32);
    return (bits & administrator) === administrator || (bits & manageGuild) === manageGuild;
  } catch (err) {
    return false;
  }
}

function manageableGuilds(user) {
  const guilds = user && Array.isArray(user.guilds) ? user.guilds : [];
  return guilds.filter(function (guild) {
    return guild.owner === true || hasManagePermission(guild.permissions);
  });
}

function canManageGuild(user, guildId) {
  if (isMainAdmin(user)) return true;
  return manageableGuilds(user).some(function (guild) {
    return String(guild.id) === String(guildId);
  });
}

function avatarUrl(user) {
  if (!user) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  if (user.avatar) {
    return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=128';
  }
  let index = 0;
  try {
    index = Number((BigInt(user.id) >> BigInt(22)) % BigInt(6));
  } catch (err) {
    index = 0;
  }
  return 'https://cdn.discordapp.com/embed/avatars/' + index + '.png';
}

function guildIconUrl(id, icon) {
  if (!icon) return null;
  return 'https://cdn.discordapp.com/icons/' + id + '/' + icon + '.png?size=128';
}

function inviteUrl(guildId) {
  let url = 'https://discord.com/oauth2/authorize?client_id=' + encodeURIComponent(CLIENT_ID);
  url += '&permissions=8&scope=bot%20applications.commands';
  if (guildId) {
    url += '&guild_id=' + encodeURIComponent(guildId) + '&disable_guild_select=true';
  }
  return url;
}

function extractJson(text) {
  if (!text) return null;
  const value = String(text).trim();
  for (let start = 0; start < value.length; start++) {
    if (value.charAt(start) !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < value.length; i++) {
      const character = value.charAt(i);
      if (inString) {
        if (escape) {
          escape = false;
        } else if (character === '\\') {
          escape = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === '{') {
        depth++;
      } else if (character === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(value.slice(start, i + 1));
          } catch (err) {
            break;
          }
        }
      }
    }
  }
  return null;
}

function clampConfidence(value) {
  if (typeof value === 'string') {
    const label = value.toLowerCase().trim();
    if (label === 'high' || label === 'very high') return 0.9;
    if (label === 'medium' || label === 'moderate') return 0.7;
    if (label === 'low') return 0.4;
  }
  let number = parseFloat(value);
  if (isNaN(number)) return 0;
  if (number > 1 && number <= 100) number = number / 100;
  return Math.max(0, Math.min(1, number));
}

async function callOpenRouter(model, system, user, jsonMode) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) return { ok: false, status: 0, error: 'OPENROUTER_API_KEY is not set on the dashboard.' };

  try {
    const payload = {
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0,
      max_tokens: 240
    };

    if (jsonMode !== false) payload.response_format = { type: 'json_object' };

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://zyranodes.com',
        'X-Title': 'Zyron Dashboard'
      },
      timeout: 8000
    });

    const data = response.data || {};
    const choice = data.choices && data.choices[0] ? data.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : '';
    const parsed = extractJson(content);
    if (!parsed) return { ok: false, status: 200, error: 'The model did not return JSON.' };

    let verdict = String(parsed.verdict || 'uncertain').toLowerCase();
    if (verdict === 'hostile' || verdict === 'malicious') verdict = 'abuse';
    let action = String(parsed.action || 'none').toLowerCase();
    if (action === 'ban') action = 'timeout';
    if (['timeout', 'delete', 'none'].indexOf(action) === -1) action = 'none';
    let category = String(parsed.category || 'none').toLowerCase();
    if (category === 'threats') category = 'threat';

    return {
      ok: true,
      verdict: verdict,
      action: action,
      severity: String(parsed.severity || 'medium').toLowerCase(),
      confidence: clampConfidence(parsed.confidence),
      category: category,
      reason: String(parsed.reason || parsed.reasoning || 'No reason returned.').slice(0, 280),
      model: data.model || model
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return { ok: false, status: 0, error: 'The AI request timed out.' };
    }
    const apiMessage = err.response && err.response.data && err.response.data.error && err.response.data.error.message;
    const status = err.response && err.response.status ? err.response.status : 0;
    return { ok: false, status: status, error: String(apiMessage || err.message).slice(0, 240) };
  }
}

async function testAi(text) {
  const chain = [
    process.env.OPENROUTER_MODEL || 'openrouter/auto',
    process.env.OPENROUTER_FALLBACK_MODEL || 'poolside/laguna-s-2.1:free',
    process.env.OPENROUTER_FALLBACK_MODEL_2 || 'openrouter/free'
  ];

  const system = [
    'You are Zyron AI Guard, a Discord message moderator.',
    'Classify the message. Profanity alone is minor. Threats, doxxing, scams, hate speech and NSFW are abuse.',
    'Never recommend a ban. The strongest action is timeout.',
    'Return ONLY compact JSON with keys verdict, severity, action, confidence, category, reason.',
    'verdict must be abuse, legit or uncertain. action must be timeout, delete or none.'
  ].join('\n');

  const user = JSON.stringify({
    task: 'dashboard_ai_test',
    guild: { name: 'Dashboard test' },
    message: { content: String(text || '').slice(0, 1200) },
    heuristic: 'manual test'
  });

  const tried = [];
  let lastError = '';

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (!model || tried.indexOf(model) !== -1) continue;
    tried.push(model);

    let result = await callOpenRouter(model, system, user, true);

    if (!result.ok && (result.status === 400 || result.status === 422)) {
      result = await callOpenRouter(model, system, user, false);
    }

    if (result.ok) return result;
    if (result.error) lastError = result.error;
  }

  return {
    ok: false,
    error: lastError || 'No AI model answered. Check the OpenRouter key and credits.'
  };
}

passport.serializeUser(function (user, done) {
  const compact = manageableGuilds(user).map(function (guild) {
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon || null,
      owner: guild.owner === true,
      permissions: String(guild.permissions || '0')
    };
  });

  let guilds = compact;
  if (JSON.stringify(compact).length > 3200) {
    guilds = compact.map(function (guild) {
      return {
        id: guild.id,
        owner: guild.owner,
        permissions: guild.permissions
      };
    });
  }

  done(null, {
    id: user.id,
    username: user.username,
    global_name: user.global_name || null,
    discriminator: user.discriminator || '0',
    avatar: user.avatar || null,
    guilds: guilds
  });
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

if (OAUTH_READY) {
  passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: REDIRECT_URI,
    scope: ['identify', 'guilds']
  }, function (accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }));
}

function firstExisting(paths, fallback) {
  for (let i = 0; i < paths.length; i += 1) {
    if (fs.existsSync(paths[i])) return paths[i];
  }
  return fallback;
}

const VIEWS_DIR = firstExisting([
  path.join(__dirname, 'views'),
  path.join(__dirname, 'dashboard', 'views'),
  path.join(process.cwd(), 'views'),
  path.join('/var/task', 'views')
], path.join(__dirname, 'views'));

const PUBLIC_DIR = firstExisting([
  path.join(__dirname, 'public'),
  path.join(__dirname, 'dashboard', 'public'),
  path.join(process.cwd(), 'public'),
  path.join('/var/task', 'public')
], path.join(__dirname, 'public'));

app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);
app.set('trust proxy', 1);
app.use(express.static(PUBLIC_DIR));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'zyron.sid',
  keys: [SESSION_SECRET],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: SECURE_COOKIES
}));

app.use(function (req, res, next) {
  function addPassportCompat(session) {
    if (!session) return session;

    if (typeof session.save !== 'function') {
      session.save = function (callback) {
        if (callback) callback(null);
      };
    }

    if (typeof session.regenerate !== 'function') {
      session.regenerate = function (callback) {
        const fresh = {};
        addPassportCompat(fresh);
        req.session = fresh;
        if (callback) callback(null);
      };
    }

    return session;
  }

  addPassportCompat(req.session);
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use(function (req, res, next) {
  res.locals.user = req.user || null;
  res.locals.currentPath = req.path;
  res.locals.brand = {
    name: 'Zyron',
    company: 'Zyra Nodes Limited',
    invite: INVITE_URL
  };
  res.locals.remoteMode = REMOTE_MODE;
  if (req.user) {
    req.user.isMainAdmin = isMainAdmin(req.user);
    req.user.displayName = req.user.global_name || req.user.username || 'Discord User';
    req.user.avatarUrl = avatarUrl(req.user);
  }
  next();
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (botApi.isConfigured()) {
      botApi.heartbeat({
        dashboardUrl: process.env.DASHBOARD_PUBLIC_URL || '',
        version: '1.0.0'
      }).catch(function () {});
    }
    return next();
  }
  return res.redirect('/login');
}

function requireMainAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) return res.redirect('/login');
  if (!isMainAdmin(req.user)) {
    return res.status(403).render('error', {
      message: 'You do not have access to the main admin panel.'
    });
  }
  return next();
}

app.get('/', function (req, res) {
  if (req.isAuthenticated && req.isAuthenticated()) return res.redirect('/dashboard');
  return res.redirect('/login');
});

app.get('/login', function (req, res) {
  if (req.isAuthenticated && req.isAuthenticated()) return res.redirect('/dashboard');
  return res.render('login', {
    error: req.query.error || null,
    oauthReady: OAUTH_READY
  });
});

app.get('/auth/debug', function (req, res) {
  return res.json({
    ok: true,
    oauthReady: OAUTH_READY,
    clientId: CLIENT_ID,
    host: req.get('host') || null,
    protocol: req.protocol,
    callbackURL: oauthCallbackUrl(req),
    configuredRedirect: REDIRECT_URI
  });
});

app.get('/auth/discord', function (req, res, next) {
  if (!OAUTH_READY) {
    return res.redirect('/login?error=' + encodeURIComponent('Discord OAuth is not configured. Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET to the dashboard .env file.'));
  }
  return passport.authenticate('discord', {
    callbackURL: oauthCallbackUrl(req)
  })(req, res, next);
});

app.get('/auth/discord/callback', function (req, res, next) {
  if (!OAUTH_READY) return res.redirect('/login');
  return passport.authenticate('discord', {
    callbackURL: oauthCallbackUrl(req),
    failureRedirect: '/login?error=' + encodeURIComponent('Discord login failed. Register this exact redirect URI in the Discord Developer Portal: ' + oauthCallbackUrl(req))
  })(req, res, next);
}, function (req, res) {
  return res.redirect('/dashboard');
});

app.get('/logout', function (req, res) {
  req.session = null;
  res.clearCookie('zyron.sid');
  return res.redirect('/login');
});

app.get('/dashboard', requireAuth, async function (req, res, next) {
  try {
    const botMap = await getBotGuilds();
    const guilds = manageableGuilds(req.user).map(function (guild) {
      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon || null,
        owner: guild.owner === true,
        hasBot: Boolean(botMap[guild.id]),
        inviteUrl: inviteUrl(guild.id)
      };
    });

    guilds.sort(function (a, b) {
      if (a.hasBot !== b.hasBot) return a.hasBot ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const withBot = guilds.filter(function (guild) {
      return guild.hasBot;
    }).length;

    return res.render('server-picker', {
      servers: guilds,
      stats: {
        total: guilds.length,
        withBot: withBot,
        withoutBot: guilds.length - withBot
      },
      botGuildCount: Object.keys(botMap).length,
      botApiOnline: REMOTE_MODE ? botApiReachable : null,
      botGuildSource: botGuildCache.source
    });
  } catch (err) {
    return next(err);
  }
});

app.get('/server/:id', requireAuth, async function (req, res, next) {
  try {
    const serverId = String(req.params.id);

    if (!canManageGuild(req.user, serverId)) {
      return res.status(403).render('error', {
        message: 'You need the Manage Server or Administrator permission on that server.'
      });
    }

    const botMap = await getBotGuilds();
    if (!botMap[serverId]) {
      return res.redirect(inviteUrl(serverId));
    }

    let settings;
    try {
      settings = await loadGuildSettings(serverId);
    } catch (err) {
      return res.status(503).render('error', {
        message: 'Live settings are unavailable because the bot API is offline. Start the bot or check BOT_API_URL and BOT_API_KEY. Details: ' + err.message
      });
    }

    const userGuild = (req.user.guilds || []).filter(function (guild) {
      return String(guild.id) === serverId;
    })[0] || null;
    const botGuild = botMap[serverId];

    return res.render('server', {
      serverId: serverId,
      serverName: (userGuild && userGuild.name) || (botGuild && botGuild.name) || ('Server ' + serverId),
      serverIcon: guildIconUrl(serverId, (userGuild && userGuild.icon) || (botGuild && botGuild.icon)),
      settings: settings,
      featureCatalog: FEATURE_CATALOG,
      featureGroups: FEATURE_GROUPS,
      aiReady: Boolean(process.env.OPENROUTER_API_KEY),
      defaultModel: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      botApiOnline: REMOTE_MODE ? botApiReachable : null
    });
  } catch (err) {
    return next(err);
  }
});

app.post('/api/server/:id/update', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }

  const body = req.body || {};
  let existing;
  try {
    existing = await loadGuildSettings(serverId);
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'Could not load current settings: ' + err.message });
  }
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
    const features = Object.assign({}, existing.features);
    Object.keys(body.features).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(BASE_FEATURES, key)) {
        features[key] = Boolean(body.features[key]);
      }
    });
    updates.features = features;
  }

  try {
    const merged = await saveGuildSettings(serverId, updates);
    return res.json({ ok: true, settings: merged });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const aiTestCooldowns = new Map();

app.post('/api/ai/test', requireAuth, async function (req, res) {
  const body = req.body || {};
  const serverId = body.serverId ? String(body.serverId) : '';

  if (serverId && !canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot test AI on this server.' });
  }

  const text = String(body.text || '').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Enter a message to test.' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(400).json({ ok: false, error: 'OPENROUTER_API_KEY is not set on the dashboard.' });
  }

  const now = Date.now();
  const lastTest = aiTestCooldowns.get(req.user.id) || 0;
  if (now - lastTest < 5000) {
    return res.status(429).json({ ok: false, error: 'Please wait a few seconds between AI tests.' });
  }
  aiTestCooldowns.set(req.user.id, now);

  try {
    const result = await testAi(text.slice(0, 1200));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/admin', requireMainAdmin, async function (req, res, next) {
  try {
    const botMap = await getBotGuilds();
    const ids = {};
    let localData = { guilds: {}, coOwners: [] };

    if (!REMOTE_MODE) {
      localData = readBotDB();
      Object.keys(localData.guilds || {}).forEach(function (id) {
        ids[id] = true;
      });
    }

    Object.keys(botMap || {}).forEach(function (id) {
      ids[id] = true;
    });

    let coOwners = localData.coOwners || [];
    if (REMOTE_MODE) {
      try {
        const meta = await botApi.getMeta();
        coOwners = meta.coOwners || [];
      } catch (err) {
        console.error('Bot API meta lookup failed:', err.message);
        if (fs.existsSync(DB_PATH)) {
          const local = readBotDB();
          coOwners = local.coOwners || [];
        }
      }
    }

    const servers = Object.keys(ids).map(function (id) {
      const info = botMap[id] || {};
      const source = REMOTE_MODE
        ? (info.settings || {})
        : (localData.guilds[id] || {});
      const settings = normalizeGuild(source);
      const icon = info.icon || null;

      return {
        id: id,
        name: info.name || ('Server ' + id),
        icon: icon,
        iconUrl: guildIconUrl(id, icon),
        prefix: settings.prefix,
        antiNuke: settings.antiNukeEnabled,
        aiEnabled: settings.aiEnabled,
        punishment: settings.punishment,
        raidPunishment: settings.raidPunishment,
        hasBot: Boolean(botMap[id]),
        protectedCount: Object.keys(settings.features || {}).filter(function (key) {
          return settings.features[key];
        }).length
      };
    });

    servers.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    const aiEnabled = servers.filter(function (server) {
      return server.aiEnabled;
    }).length;

    return res.render('admin', {
      servers: servers,
      stats: {
        total: servers.length,
        aiEnabled: aiEnabled,
        coOwners: coOwners.length,
        withBot: servers.filter(function (server) {
          return server.hasBot;
        }).length
      },
      coOwners: coOwners,
      dbPath: REMOTE_MODE ? ('Bot API: ' + botApi.baseUrl()) : DB_PATH,
      botConfigured: REMOTE_MODE ? true : Boolean(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN)
    });
  } catch (err) {
    return next(err);
  }
});

app.get('/link-test', requireAuth, async function (req, res, next) {
  try {
    await botApi.heartbeat({
      dashboardUrl: process.env.DASHBOARD_PUBLIC_URL || '',
      version: '1.0.0'
    }, true);
    const result = await botApi.test();
    return res.render('link-test', {
      result: result,
      mode: REMOTE_MODE ? 'remote' : 'local',
      botApiUrl: botApi.baseUrl() || '',
      maskedKey: botApi.maskedKey()
    });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/link-test', requireAuth, async function (req, res) {
  try {
    const result = await botApi.test();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/healthz', function (req, res) {
  return res.json({
    ok: true,
    service: 'zyron-dashboard',
    mode: REMOTE_MODE ? 'remote' : 'local',
    botApi: REMOTE_MODE ? botApi.baseUrl() : null,
    db: REMOTE_MODE ? null : DB_PATH
  });
});

app.use(function (req, res) {
  return res.status(404).render('error', {
    message: 'Page not found. Use the dashboard to pick a server.'
  });
});

app.use(function (err, req, res, next) {
  console.error('Dashboard error:', err);
  return res.status(500).render('error', {
    message: 'Something went wrong on the dashboard. Check the console for details.'
  });
});

if (require.main === module) {
  app.listen(PORT, function () {
    console.log('Zyron Dashboard running on http://localhost:' + PORT);
    console.log('Bot database: ' + DB_PATH);
    console.log('Discord OAuth: ' + (OAUTH_READY ? 'configured' : 'missing client ID or secret'));
  });
}

module.exports = app;
