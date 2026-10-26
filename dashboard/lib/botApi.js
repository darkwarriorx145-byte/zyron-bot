const axios = require('axios');

const BASE_URL = String(process.env.BOT_API_URL || '').replace(/\/+$/, '');
const API_KEY = String(process.env.BOT_API_KEY || '');

function isConfigured() {
  return Boolean(BASE_URL && API_KEY);
}

function baseUrl() {
  return BASE_URL;
}

function maskedKey() {
  if (!API_KEY) return '';
  if (API_KEY.length <= 8) return '********';
  return API_KEY.slice(0, 4) + '...' + API_KEY.slice(-4);
}

async function request(method, path, data) {
  if (!isConfigured()) {
    throw new Error('BOT_API_URL and BOT_API_KEY are not configured on the dashboard.');
  }

  try {
    const response = await axios({
      method: method,
      url: BASE_URL + path,
      data: data,
      timeout: 8000,
      headers: {
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      validateStatus: function () { return true; }
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    }

    const message = response.data && response.data.error
      ? response.data.error
      : 'Bot API returned HTTP ' + response.status;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  } catch (err) {
    if (err.status) throw err;

    if (err.response) {
      const message = err.response.data && err.response.data.error
        ? err.response.data.error
        : 'Bot API returned HTTP ' + err.response.status;
      const wrapped = new Error(message);
      wrapped.status = err.response.status;
      throw wrapped;
    }

    if (err.code === 'ECONNABORTED') {
      throw new Error('Bot API timed out. Check BOT_API_URL and the Pterodactyl port.');
    }

    throw new Error('Cannot reach the bot API: ' + err.message);
  }
}

async function health() {
  return request('GET', '/api/health');
}

async function linkStatus() {
  return request('GET', '/api/link-status');
}

async function getGuilds() {
  return request('GET', '/api/guilds');
}

async function getMeta() {
  return request('GET', '/api/meta');
}

async function getSettings(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/settings');
}

async function updateSettings(guildId, updates) {
  return request('PATCH', '/api/guilds/' + encodeURIComponent(guildId) + '/settings', updates);
}

let lastHeartbeatAt = 0;

async function heartbeat(payload, force) {
  if (!isConfigured()) return null;

  const now = Date.now();
  if (!force && now - lastHeartbeatAt < 60000) return null;
  lastHeartbeatAt = now;

  try {
    return await request('POST', '/api/heartbeat', payload || {});
  } catch (err) {
    console.error('Bot API heartbeat failed:', err.message);
    return null;
  }
}

async function test() {
  if (!isConfigured()) {
    return {
      ok: false,
      configured: false,
      error: 'BOT_API_URL and BOT_API_KEY are not set on the dashboard.'
    };
  }

  try {
    const healthResult = await health();
    const linkResult = await linkStatus();
    return {
      ok: true,
      configured: true,
      health: healthResult,
      link: linkResult
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err.message
    };
  }
}

module.exports = {
  isConfigured: isConfigured,
  baseUrl: baseUrl,
  maskedKey: maskedKey,
  request: request,
  health: health,
  linkStatus: linkStatus,
  getGuilds: getGuilds,
  getMeta: getMeta,
  getSettings: getSettings,
  updateSettings: updateSettings,
  heartbeat: heartbeat,
  test: test
};
