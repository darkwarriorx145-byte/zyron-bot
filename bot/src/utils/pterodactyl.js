const https = require('https');
const http = require('http');
const { URL } = require('url');
const db = require('../database/db');
const config = require('../../config.json');

const PTERE_API_TIMEOUT = 15000;

function getPanelConfig(guildId) {
  const integrations = db.data.integrations && db.data.integrations[guildId];
  if (!integrations || !integrations.length) return null;
  const panel = integrations.find(function (i) { return i.type === 'pterodactyl' && i.enabled !== false; });
  if (!panel || !panel.url || !panel.apiKey) return null;
  return {
    url: panel.url.replace(/\/+$/, ''),
    apiKey: panel.apiKey
  };
}

function request(panel, path, options) {
  return new Promise(function (resolve, reject) {
    let parsed;
    try {
      parsed = new URL(panel.url + path);
    } catch (err) {
      return reject(new Error('Invalid panel URL.'));
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Zyron-Pterodactyl/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + panel.apiKey
    };

    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: headers,
      timeout: PTERE_API_TIMEOUT
    };

    if (options.body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = transport.request(reqOptions, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        let parsedData;
        try { parsedData = data ? JSON.parse(data) : {}; } catch (e) { parsedData = {}; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: parsedData });
        } else {
          const error = parsedData.errors && parsedData.errors[0] && parsedData.errors[0].detail
            ? parsedData.errors[0].detail
            : 'HTTP ' + res.statusCode;
          reject(new Error(error));
        }
      });
    });

    req.on('timeout', function () {
      req.destroy(new Error('Request timed out.'));
    });
    req.on('error', function (err) {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function listNests(panel, page) {
  const query = page ? '?page=' + page : '';
  return request(panel, '/api/application/nests' + query, { method: 'GET' });
}

async function listAllNests(panel) {
  let all = [];
  let page = 1;
  while (true) {
    const res = await listNests(panel, page);
    const nests = res.data.data || [];
    all = all.concat(nests.map(function (n) { return n.attributes; }));
    const meta = res.data.meta || {};
    const pagination = meta.pagination || {};
    if (page >= pagination.total_pages) break;
    page++;
  }
  return all;
}

async function getNest(panel, nestId) {
  return request(panel, '/api/application/nests/' + nestId, { method: 'GET' });
}

async function listEggs(panel, nestId, page) {
  const query = page ? '?page=' + page : '';
  return request(panel, '/api/application/nests/' + nestId + '/eggs' + query, { method: 'GET' });
}

async function listAllEggs(panel, nestId) {
  let all = [];
  let page = 1;
  while (true) {
    const res = await listEggs(panel, nestId, page);
    const eggs = res.data.data || [];
    all = all.concat(eggs.map(function (e) { return e.attributes; }));
    const meta = res.data.meta || {};
    const pagination = meta.pagination || {};
    if (page >= pagination.total_pages) break;
    page++;
  }
  return all;
}

async function getEgg(panel, nestId, eggId) {
  return request(panel, '/api/application/nests/' + nestId + '/eggs/' + eggId, { method: 'GET' });
}

async function listLocations(panel) {
  return request(panel, '/api/application/locations', { method: 'GET' });
}

async function listUsers(panel, page) {
  const query = page ? '?page=' + page : '';
  return request(panel, '/api/application/users' + query, { method: 'GET' });
}

async function findUserByEmail(panel, email) {
  const res = await request(panel, '/api/application/users?filter[email]=' + encodeURIComponent(email), { method: 'GET' });
  const users = res.data.data || [];
  if (users.length) return users[0].attributes;
  return null;
}

async function createUser(panel, payload) {
  return request(panel, '/api/application/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function createServer(panel, payload) {
  return request(panel, '/api/application/servers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function getServer(panel, serverId) {
  return request(panel, '/api/application/servers/' + serverId, { method: 'GET' });
}

async function listAllocations(panel, nodeId) {
  return request(panel, '/api/application/nodes/' + nodeId + '/allocations', { method: 'GET' });
}

async function getAllDataForCreate(panel) {
  const [nests, locations] = await Promise.all([
    listAllNests(panel),
    listLocations(panel)
  ]);
  return { nests, locations };
}

async function getEggsForNest(panel, nestId) {
  const eggs = await listAllEggs(panel, nestId);
  const nest = await getNest(panel, nestId);
  return { eggs, nest: nest.data.attributes };
}

async function getVariablesForEgg(panel, nestId, eggId) {
  const egg = await getEgg(panel, nestId, eggId);
  return egg.data.attributes;
}

module.exports = {
  getPanelConfig,
  request,
  listNests,
  listAllNests,
  getNest,
  listEggs,
  listAllEggs,
  getEgg,
  listLocations,
  listUsers,
  findUserByEmail,
  createUser,
  createServer,
  getServer,
  listAllocations,
  getAllDataForCreate,
  getEggsForNest,
  getVariablesForEgg
};