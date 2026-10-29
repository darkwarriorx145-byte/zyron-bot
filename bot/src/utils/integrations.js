const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('../database/db');

const INTEGRATION_TYPES = [
  {
    value: 'pterodactyl',
    label: 'Pterodactyl Panel',
    icon: '🦖',
    placeholder: 'https://panel.example.com',
    hint: 'Pterodactyl URL. Add an Application API key to show server status.',
    fields: ['url', 'apiKey']
  },
  {
    value: 'minecraft',
    label: 'Minecraft Server',
    icon: '⛏️',
    placeholder: 'play.example.com:25565',
    hint: 'Minecraft Java server address, or an API URL for live status.',
    fields: ['url']
  },
  {
    value: 'fivem',
    label: 'FiveM Server',
    icon: '🚓',
    placeholder: 'https://cfx.re/join/xxxxxx',
    hint: 'FiveM connect link or server API endpoint.',
    fields: ['url']
  },
  {
    value: 'uptime',
    label: 'Uptime Monitor',
    icon: '📈',
    placeholder: 'https://status.example.com',
    hint: 'Status page or monitor URL. Zyron can test reachability.',
    fields: ['url']
  },
  {
    value: 'github',
    label: 'GitHub',
    icon: '🐙',
    placeholder: 'https://github.com/owner/repo',
    hint: 'Repository or organisation URL.',
    fields: ['url']
  },
  {
    value: 'twitch',
    label: 'Twitch',
    icon: '🟣',
    placeholder: 'https://twitch.tv/channel',
    hint: 'Channel URL for your stream announcements.',
    fields: ['url']
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: '▶️',
    placeholder: 'https://youtube.com/@channel',
    hint: 'Channel URL for video announcements.',
    fields: ['url']
  },
  {
    value: 'roblox',
    label: 'Roblox',
    icon: '🧱',
    placeholder: 'https://www.roblox.com/groups/0000000',
    hint: 'Group or game URL.',
    fields: ['url']
  },
  {
    value: 'steam',
    label: 'Steam',
    icon: '🎮',
    placeholder: 'https://steamcommunity.com/groups/example',
    hint: 'Steam group or game URL.',
    fields: ['url']
  },
  {
    value: 'discord_webhook',
    label: 'Discord Webhook',
    icon: '🔗',
    placeholder: 'https://discord.com/api/webhooks/...',
    hint: 'Send Zyron alerts to another Discord channel.',
    fields: ['url', 'apiKey']
  },
  {
    value: 'custom_api',
    label: 'Custom API',
    icon: '🧩',
    placeholder: 'https://api.example.com/status',
    hint: 'Any JSON endpoint. Add a bearer key if the API needs one.',
    fields: ['url', 'apiKey']
  },
  {
    value: 'custom_link',
    label: 'Custom Link',
    icon: '🌐',
    placeholder: 'https://example.com',
    hint: 'Any other link you want visible in the dashboard.',
    fields: ['url']
  }
];

function typeInfo(type) {
  return INTEGRATION_TYPES.filter(function (item) { return item.value === type; })[0] || INTEGRATION_TYPES[INTEGRATION_TYPES.length - 1];
}

function ensureGuild(guildId) {
  if (!db.data.integrations[guildId]) db.data.integrations[guildId] = [];
  return db.data.integrations[guildId];
}

function list(guildId) {
  return ensureGuild(guildId).slice().sort(function (a, b) {
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function clean(payload) {
  const source = payload || {};
  const type = typeInfo(String(source.type || 'custom_link'));
  const url = String(source.url || '').trim().slice(0, 500);
  if (!url) throw new Error('A URL or address is required.');
  if (type.value !== 'minecraft' && !/^https?:\/\//i.test(url)) {
    throw new Error('The URL must start with http:// or https://.');
  }
  return {
    type: type.value,
    label: String(source.label || type.label).trim().slice(0, 80) || type.label,
    url: url,
    apiKey: String(source.apiKey || '').trim().slice(0, 500),
    notes: String(source.notes || '').trim().slice(0, 500),
    enabled: source.enabled === undefined ? true : Boolean(source.enabled)
  };
}

function add(guildId, payload) {
  const items = ensureGuild(guildId);
  const cleanItem = clean(payload);
  if (items.length >= 25) throw new Error('You can link up to 25 integrations per server.');

  const item = Object.assign({}, cleanItem, {
    id: crypto.randomBytes(5).toString('hex'),
    status: 'unknown',
    lastCheckedAt: null,
    lastError: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  items.push(item);
  db.save();
  return item;
}

function update(guildId, integrationId, payload) {
  const items = ensureGuild(guildId);
  const item = items.filter(function (entry) { return entry.id === integrationId; })[0];
  if (!item) throw new Error('Integration not found.');
  const merged = Object.assign({}, item, payload || {});
  if (!payload || payload.apiKey === undefined || payload.apiKey === '') merged.apiKey = item.apiKey;
  const cleanItem = clean(merged);
  Object.assign(item, cleanItem, { updatedAt: Date.now() });
  db.save();
  return item;
}

function remove(guildId, integrationId) {
  const items = ensureGuild(guildId);
  const index = items.findIndex(function (entry) { return entry.id === integrationId; });
  if (index === -1) return false;
  items.splice(index, 1);
  db.save();
  return true;
}

function requestStatus(url, apiKey, timeoutMs) {
  return new Promise(function (resolve) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return resolve({ ok: false, status: 0, error: 'Invalid URL.' });
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'Zyron-Integration-Check/1.0' };
    if (apiKey) {
      headers.Authorization = /^bearer /i.test(apiKey) ? apiKey : 'Bearer ' + apiKey;
      headers['X-API-Key'] = apiKey;
    }

    const req = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: headers,
      timeout: timeoutMs || 8000
    }, function (res) {
      resolve({
        ok: res.statusCode >= 200 && res.statusCode < 400,
        status: res.statusCode,
        error: res.statusCode >= 400 ? 'HTTP ' + res.statusCode : null
      });
      res.resume();
    });

    req.on('timeout', function () {
      req.destroy(new Error('Timed out.'));
    });
    req.on('error', function (err) {
      resolve({ ok: false, status: 0, error: err.message });
    });
    req.end();
  });
}

async function test(guildId, integrationId) {
  const items = ensureGuild(guildId);
  const item = items.filter(function (entry) { return entry.id === integrationId; })[0];
  if (!item) throw new Error('Integration not found.');

  if (item.type === 'minecraft' && !/^https?:\/\//i.test(item.url)) {
    const parts = item.url.split(':');
    const host = parts[0];
    const port = parseInt(parts[1], 10) || 25565;
    const reachable = await new Promise(function (resolve) {
      const socket = require('net').createConnection({ host: host, port: port, timeout: 5000 });
      socket.on('connect', function () { socket.destroy(); resolve(true); });
      socket.on('timeout', function () { socket.destroy(); resolve(false); });
      socket.on('error', function () { socket.destroy(); resolve(false); });
    });
    item.status = reachable ? 'online' : 'offline';
    item.lastCheckedAt = Date.now();
    item.lastError = reachable ? null : 'Server did not respond.';
    db.save();
    return item;
  }

  const result = await requestStatus(item.url, item.apiKey, 8000);
  item.status = result.ok ? 'online' : 'offline';
  item.lastCheckedAt = Date.now();
  item.lastError = result.error || null;
  item.lastStatusCode = result.status || null;
  db.save();
  return item;
}

module.exports = {
  INTEGRATION_TYPES,
  typeInfo,
  list,
  add,
  update,
  remove,
  test
};
