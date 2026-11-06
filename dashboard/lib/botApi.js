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

async function getActivity(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/activity');
}

async function reviewAppeal(guildId, caseId, action, reviewerId) {
  return request(
    'POST',
    '/api/guilds/' + encodeURIComponent(guildId) + '/appeals/' + encodeURIComponent(caseId) + '/review',
    { action: action, reviewerId: reviewerId || null }
  );
}

async function staffAction(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/staff/action', payload || {});
}

async function getUserProfile(guildId, userId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/profile/' + encodeURIComponent(userId));
}

async function getJoinGate(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/joingate');
}

async function resolveJoinGate(guildId, action, eventId, userId) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/joingate/' + encodeURIComponent(action), {
    eventId: eventId || null,
    userId: userId || null
  });
}

async function getStaffOps(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/staffops');
}

async function runStaffOpsReview(guildId) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/staffops/review', {});
}

async function listChannels(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/channels');
}

async function listRoles(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/roles');
}

async function listCustomCommands(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/custom-commands');
}

async function createCustomCommand(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/custom-commands', payload || {});
}

async function updateCustomCommand(guildId, commandId, payload) {
  return request('PATCH', '/api/guilds/' + encodeURIComponent(guildId) + '/custom-commands/' + encodeURIComponent(commandId), payload || {});
}

async function deleteCustomCommand(guildId, commandId) {
  return request('DELETE', '/api/guilds/' + encodeURIComponent(guildId) + '/custom-commands/' + encodeURIComponent(commandId));
}

async function listReactionRoles(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/reaction-roles');
}

async function createReactionRole(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/reaction-roles', payload || {});
}

async function deleteReactionRole(guildId, panelId) {
  return request('DELETE', '/api/guilds/' + encodeURIComponent(guildId) + '/reaction-roles/' + encodeURIComponent(panelId));
}

async function publishReactionRole(guildId, panelId) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/reaction-roles/' + encodeURIComponent(panelId) + '/publish');
}

async function setupVerification(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/verification', payload || {});
}

async function getVerification(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/verification');
}

async function setMaintenance(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/maintenance', payload || {});
}

async function getMaintenance(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/maintenance');
}

async function purge(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/purge', payload || {});
}

async function setNickname(guildId, payload) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/nickname', payload || {});
}

async function getLevels(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/levels');
}

async function updateLevels(guildId, payload) {
  return request('PATCH', '/api/guilds/' + encodeURIComponent(guildId) + '/levels', payload || {});
}

async function getShop(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/shop');
}

async function createShopItem(guildId, item) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/shop', { item: item || {} });
}

async function updateShopItem(guildId, itemId, item) {
  return request('PATCH', '/api/guilds/' + encodeURIComponent(guildId) + '/shop/' + encodeURIComponent(itemId), { item: item || {} });
}

async function deleteShopItem(guildId, itemId) {
  return request('DELETE', '/api/guilds/' + encodeURIComponent(guildId) + '/shop/' + encodeURIComponent(itemId));
}

async function getHealth(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/health');
}

async function runHealth(guildId) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/health/run', {});
}

async function getIntegrations(guildId) {
  return request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/integrations');
}

async function createIntegration(guildId, integration) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/integrations', { integration: integration || {} });
}

async function getGlobalInviteReward() {
  return request('GET', '/api/invite/global-reward');
}

async function setGlobalInviteReward(reward) {
  return request('POST', '/api/invite/global-reward', { reward: reward });
}

async function getGlobalInviteLeaderboard() {
  return request('GET', '/api/invite/global-leaderboard');
}

async function updateIntegration(guildId, integrationId, integration) {
  return request('PATCH', '/api/guilds/' + encodeURIComponent(guildId) + '/integrations/' + encodeURIComponent(integrationId), { integration: integration || {} });
}

async function deleteIntegration(guildId, integrationId) {
  return request('DELETE', '/api/guilds/' + encodeURIComponent(guildId) + '/integrations/' + encodeURIComponent(integrationId));
}

async function testIntegration(guildId, integrationId) {
  return request('POST', '/api/guilds/' + encodeURIComponent(guildId) + '/integrations/' + encodeURIComponent(integrationId) + '/test', {});
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
  getActivity: getActivity,
  reviewAppeal: reviewAppeal,
  staffAction: staffAction,
  getUserProfile: getUserProfile,
  getJoinGate: getJoinGate,
  resolveJoinGate: resolveJoinGate,
  getStaffOps: getStaffOps,
  runStaffOpsReview: runStaffOpsReview,
  listChannels: listChannels,
  listRoles: listRoles,
  listCustomCommands: listCustomCommands,
  createCustomCommand: createCustomCommand,
  updateCustomCommand: updateCustomCommand,
  deleteCustomCommand: deleteCustomCommand,
  listReactionRoles: listReactionRoles,
  createReactionRole: createReactionRole,
  deleteReactionRole: deleteReactionRole,
  publishReactionRole: publishReactionRole,
  setupVerification: setupVerification,
  getVerification: getVerification,
  setMaintenance: setMaintenance,
  getMaintenance: getMaintenance,
  purge: purge,
  setNickname: setNickname,
  getLevels: getLevels,
  updateLevels: updateLevels,
  getShop: getShop,
  createShopItem: createShopItem,
  updateShopItem: updateShopItem,
  deleteShopItem: deleteShopItem,
  getHealth: getHealth,
  runHealth: runHealth,
  getIntegrations: getIntegrations,
  createIntegration: createIntegration,
  updateIntegration: updateIntegration,
  deleteIntegration: deleteIntegration,
  testIntegration: testIntegration,
  getGlobalInviteReward: getGlobalInviteReward,
  setGlobalInviteReward: setGlobalInviteReward,
  getGlobalInviteLeaderboard: getGlobalInviteLeaderboard,
  heartbeat: heartbeat,
  test: test
};
