const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

const DB_PATH = path.join(__dirname, '../../data/database.json');

const DASHBOARD_KEYS = [
  'prefix',
  'punishment',
  'raidPunishment',
  'antiNukeEnabled',
  'aiEnabled',
  'aiScanMessages',
  'aiModel',
  'aiConfidence',
  'aiAction',
  'economyDaily',
  'economyInvite',
  'logChannel',
  'autoRoleId',
  'autoRoleBotId',
  'boosterRoleId',
  'features'
];

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = filePath + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tempPath, content, 'utf8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    fs.copyFileSync(tempPath, filePath);
    try { fs.unlinkSync(tempPath); } catch (cleanupErr) {}
  }
}

const EXTRA_FEATURES = {
  antiSpam: true,
  antiLink: true,
  antiChannelRecovery: true,
  antiBetrayal: true,
  antiAbuse: true,
  antiRaid: true,
  autoLockdown: true,
  autoMod: true
};

function defaults() {
  return Object.assign({}, config.defaultSettings.features, EXTRA_FEATURES);
}

class Database {
  constructor() {
    this.data = {
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
    this.messageBuffer = 0;
    this.lastSyncMtime = 0;
    this.lastSyncSize = 0;
    this.init();

    const self = this;
    setInterval(function () {
      if (self.messageBuffer > 0) {
        self.messageBuffer = 0;
        self.save();
      }
    }, 60000);
  }

  init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        this.data.guilds = parsed.guilds || {};
        this.data.warnings = parsed.warnings || {};
        this.data.channels = parsed.channels || {};
        this.data.messages = parsed.messages || {};
        this.data.invites = parsed.invites || {};
        this.data.inviteMembers = parsed.inviteMembers || {};
        this.data.coOwners = parsed.coOwners || [];
        this.data.lockdowns = parsed.lockdowns || {};
        this.data.coins = parsed.coins || {};
        this.data.cooldowns = parsed.cooldowns || {};
      } catch (err) {
        console.error('Database load failed, starting fresh:', err.message);
      }
    }

    this.save();
  }

  syncDashboardSettings() {
    try {
      if (!fs.existsSync(DB_PATH)) return;

      const stat = fs.statSync(DB_PATH);
      if (this.lastSyncMtime && stat.mtimeMs === this.lastSyncMtime && stat.size === this.lastSyncSize) return;

      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const guilds = parsed.guilds || {};
      const self = this;

      Object.keys(guilds).forEach(function (guildId) {
        const source = guilds[guildId] || {};
        if (!self.data.guilds[guildId]) self.data.guilds[guildId] = {};

        DASHBOARD_KEYS.forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            self.data.guilds[guildId][key] = source[key];
          }
        });
      });

      this.lastSyncMtime = stat.mtimeMs;
      this.lastSyncSize = stat.size;
    } catch (err) {
      console.error('Database settings sync failed:', err.message);
    }
  }

  save() {
    try {
      this.syncDashboardSettings();
      writeFileAtomic(DB_PATH, JSON.stringify(this.data, null, 2));
      const stat = fs.statSync(DB_PATH);
      this.lastSyncMtime = stat.mtimeMs;
      this.lastSyncSize = stat.size;
    } catch (err) {
      console.error('Database save failed:', err.message);
    }
  }

  getGuild(guildId) {
    this.syncDashboardSettings();

    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = {
        prefix: config.prefix,
        antiNukeEnabled: config.defaultSettings.antiNukeEnabled,
        punishment: config.defaultSettings.punishment,
        logChannel: null,
        ticketCategory: null,
        ticketLogChannel: null,
        ticketStaffRole: null,
        ticketCounter: 0,
        ticketButtons: [],
        applicationChannel: null,
        inviteLogChannel: null,
        autoRoleId: null,
        autoRoleBotId: null,
        boosterRoleId: null,
        raidPunishment: 'kick',
        lockdown: null,
        betrayed: [],
        extraOwners: [],
        whitelist: [],
        featureWhitelist: {},
        aiEnabled: true,
        aiModel: null,
        aiScanMessages: true,
        aiConfidence: 0.6,
        aiAction: 'auto',
        economyDaily: 100,
        economyInvite: 25,
        features: defaults()
      };
      this.save();
    }

    const guild = this.data.guilds[guildId];
    if (!guild.features) guild.features = {};
    if (!guild.whitelist) guild.whitelist = [];
    if (!guild.extraOwners) guild.extraOwners = [];
    if (!guild.betrayed) guild.betrayed = [];
    if (!guild.featureWhitelist) guild.featureWhitelist = {};
    for (const featureKey in guild.featureWhitelist) {
      if (!Array.isArray(guild.featureWhitelist[featureKey])) guild.featureWhitelist[featureKey] = [];
    }
    if (guild.raidPunishment === undefined) guild.raidPunishment = 'kick';
    if (guild.aiEnabled === undefined) guild.aiEnabled = true;
    if (guild.aiScanMessages === undefined) guild.aiScanMessages = true;
    if (guild.aiConfidence === undefined) guild.aiConfidence = 0.6;
    if (guild.aiAction === undefined) guild.aiAction = 'auto';
    if (guild.aiModel === undefined) guild.aiModel = null;
    if (guild.economyDaily === undefined) guild.economyDaily = 100;
    if (guild.economyInvite === undefined) guild.economyInvite = 25;
    if (!guild.ticketButtons) guild.ticketButtons = [];
    if (guild.ticketCounter === undefined) guild.ticketCounter = 0;

    const base = defaults();
    for (const key in base) {
      if (guild.features[key] === undefined) guild.features[key] = base[key];
    }

    return guild;
  }

  updateGuild(guildId, updates) {
    const current = this.getGuild(guildId);
    this.data.guilds[guildId] = Object.assign({}, current, updates);
    this.save();
    return this.data.guilds[guildId];
  }

  setFeature(guildId, featureName, status) {
    const guild = this.getGuild(guildId);
    guild.features[featureName] = status;
    this.save();
    return guild;
  }

  addWhitelist(guildId, userId) {
    const guild = this.getGuild(guildId);
    if (guild.whitelist.indexOf(userId) === -1) {
      guild.whitelist.push(userId);
      this.save();
    }
    return guild.whitelist;
  }

  removeWhitelist(guildId, userId) {
    const guild = this.getGuild(guildId);
    guild.whitelist = guild.whitelist.filter(function (id) {
      return id !== userId;
    });
    this.save();
    return guild.whitelist;
  }

  isWhitelisted(guildId, userId) {
    const guild = this.getGuild(guildId);
    return guild.whitelist.indexOf(userId) !== -1;
  }

  getFeatureWhitelist(guildId, feature) {
    const guild = this.getGuild(guildId);
    if (!guild.featureWhitelist) guild.featureWhitelist = {};
    if (!Array.isArray(guild.featureWhitelist[feature])) guild.featureWhitelist[feature] = [];
    return guild.featureWhitelist[feature];
  }

  addFeatureWhitelist(guildId, feature, userId) {
    const list = this.getFeatureWhitelist(guildId, feature);
    if (list.indexOf(userId) === -1) {
      list.push(userId);
      this.save();
    }
    return list;
  }

  removeFeatureWhitelist(guildId, feature, userId) {
    const guild = this.getGuild(guildId);
    const list = this.getFeatureWhitelist(guildId, feature);
    guild.featureWhitelist[feature] = list.filter(function (id) {
      return id !== userId;
    });
    this.save();
    return guild.featureWhitelist[feature];
  }

  isFeatureWhitelisted(guildId, feature, userId) {
    if (!feature || !userId) return false;
    return this.getFeatureWhitelist(guildId, feature).indexOf(userId) !== -1;
  }

  clearFeatureWhitelist(guildId, feature) {
    const guild = this.getGuild(guildId);
    guild.featureWhitelist[feature] = [];
    this.save();
    return [];
  }

  addExtraOwner(guildId, userId) {
    const guild = this.getGuild(guildId);
    if (guild.extraOwners.indexOf(userId) === -1) {
      guild.extraOwners.push(userId);
      this.save();
    }
    return guild.extraOwners;
  }

  removeExtraOwner(guildId, userId) {
    const guild = this.getGuild(guildId);
    guild.extraOwners = guild.extraOwners.filter(function (id) {
      return id !== userId;
    });
    this.save();
    return guild.extraOwners;
  }

  isExtraOwner(guildId, userId) {
    const guild = this.getGuild(guildId);
    return guild.extraOwners.indexOf(userId) !== -1;
  }

  getCoOwners() {
    if (!this.data.coOwners) this.data.coOwners = [];
    return this.data.coOwners;
  }

  addCoOwner(userId) {
    if (!this.data.coOwners) this.data.coOwners = [];
    if (this.data.coOwners.indexOf(userId) === -1) {
      this.data.coOwners.push(userId);
      this.save();
    }
    return this.data.coOwners;
  }

  removeCoOwner(userId) {
    if (!this.data.coOwners) this.data.coOwners = [];
    this.data.coOwners = this.data.coOwners.filter(function (id) {
      return id !== userId;
    });
    this.save();
    return this.data.coOwners;
  }

  isCoOwner(userId) {
    if (!this.data.coOwners) return false;
    return this.data.coOwners.indexOf(userId) !== -1;
  }

  setLockdown(guildId, data) {
    if (!this.data.lockdowns) this.data.lockdowns = {};
    this.data.lockdowns[guildId] = data;
    this.save();
    return data;
  }

  getLockdown(guildId) {
    if (!this.data.lockdowns) return null;
    return this.data.lockdowns[guildId] || null;
  }

  clearLockdown(guildId) {
    if (!this.data.lockdowns) return;
    delete this.data.lockdowns[guildId];
    this.save();
  }

  addWarning(guildId, userId, warningData) {
    const key = guildId + '_' + userId;
    const info = warningData || {};

    if (!this.data.warnings[key]) this.data.warnings[key] = [];

    this.data.warnings[key].push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      reason: info.reason ? info.reason : 'No reason provided',
      moderator: info.moderator ? info.moderator : null,
      timestamp: Date.now()
    });

    this.save();
    return this.data.warnings[key];
  }

  getWarnings(guildId, userId) {
    return this.data.warnings[guildId + '_' + userId] || [];
  }

  clearWarnings(guildId, userId) {
    this.data.warnings[guildId + '_' + userId] = [];
    this.save();
    return true;
  }

  setChannelBackup(guildId, channelId, data) {
    if (!this.data.channels[guildId]) this.data.channels[guildId] = {};
    this.data.channels[guildId][channelId] = data;
    this.save();
  }

  getChannelBackup(guildId, channelId) {
    if (!this.data.channels[guildId]) return null;
    return this.data.channels[guildId][channelId] || null;
  }

  removeChannelBackup(guildId, channelId) {
    if (!this.data.channels[guildId]) return;
    delete this.data.channels[guildId][channelId];
    this.save();
  }

  getChannelBackups(guildId) {
    return this.data.channels[guildId] || {};
  }

  addMessage(guildId, userId) {
    if (!this.data.messages[guildId]) this.data.messages[guildId] = {};
    this.data.messages[guildId][userId] = (this.data.messages[guildId][userId] || 0) + 1;
    this.messageBuffer++;

    if (this.messageBuffer >= 25) {
      this.messageBuffer = 0;
      this.save();
    }
  }

  getMessages(guildId, userId) {
    if (!this.data.messages[guildId]) return 0;
    return this.data.messages[guildId][userId] || 0;
  }

  getInviteStats(guildId, userId) {
    if (!this.data.invites[guildId]) this.data.invites[guildId] = {};

    if (!this.data.invites[guildId][userId]) {
      this.data.invites[guildId][userId] = {
        total: 0,
        real: 0,
        fake: 0,
        left: 0,
        rejoin: 0
      };
    }

    return this.data.invites[guildId][userId];
  }

  addInvite(guildId, userId, field, amount) {
    if (!userId) return null;

    const stats = this.getInviteStats(guildId, userId);
    const value = amount === undefined ? 1 : amount;

    if (stats[field] === undefined) stats[field] = 0;
    stats[field] += value;
    if (stats[field] < 0) stats[field] = 0;

    this.save();
    return stats;
  }

  resetInvites(guildId, userId) {
    if (userId) {
      this.getInviteStats(guildId, userId);
      this.data.invites[guildId][userId] = {
        total: 0,
        real: 0,
        fake: 0,
        left: 0,
        rejoin: 0
      };
    } else {
      this.data.invites[guildId] = {};
    }

    this.save();
    return true;
  }

  getInviteLeaderboard(guildId, field, limit) {
    const guild = this.data.invites[guildId] || {};
    const list = [];

    for (const userId in guild) {
      const stats = guild[userId];
      list.push({
        userId: userId,
        amount: stats[field] || 0,
        stats: stats
      });
    }

    list.sort(function (a, b) {
      return b.amount - a.amount;
    });

    return list.slice(0, limit || 10);
  }

  setInviteRecord(guildId, memberId, record) {
    if (!this.data.inviteMembers[guildId]) this.data.inviteMembers[guildId] = {};
    this.data.inviteMembers[guildId][memberId] = record;
    this.save();
  }

  getInviteRecord(guildId, memberId) {
    if (!this.data.inviteMembers[guildId]) return null;
    return this.data.inviteMembers[guildId][memberId] || null;
  }

  // Economy methods
  getCoins(guildId, userId) {
    if (!this.data.coins) this.data.coins = {};
    if (!this.data.coins[guildId]) this.data.coins[guildId] = {};
    if (!this.data.coins[guildId][userId]) this.data.coins[guildId][userId] = 0;
    return this.data.coins[guildId][userId];
  }

  addCoins(guildId, userId, amount) {
    const current = this.getCoins(guildId, userId);
    if (!this.data.coins) this.data.coins = {};
    if (!this.data.coins[guildId]) this.data.coins[guildId] = {};
    this.data.coins[guildId][userId] = current + amount;
    this.save();
    return this.data.coins[guildId][userId];
  }

  removeCoins(guildId, userId, amount) {
    const current = this.getCoins(guildId, userId);
    if (!this.data.coins) this.data.coins = {};
    if (!this.data.coins[guildId]) this.data.coins[guildId] = {};
    const next = Math.max(0, current - amount);
    this.data.coins[guildId][userId] = next;
    this.save();
    return next;
  }

  getCoinLeaderboard(guildId, limit) {
    if (!this.data.coins || !this.data.coins[guildId]) return [];
    const guild = this.data.coins[guildId];
    const list = [];
    for (const userId in guild) {
      const amount = guild[userId] || 0;
      if (amount > 0) list.push({ userId: userId, amount: amount });
    }
    list.sort(function (a, b) { return b.amount - a.amount; });
    return list.slice(0, limit || 10);
  }

  // Cooldown methods
  getCooldown(key) {
    if (!this.data.cooldowns) this.data.cooldowns = {};
    return this.data.cooldowns[key] || null;
  }

  setCooldown(key, timestamp) {
    if (!this.data.cooldowns) this.data.cooldowns = {};
    this.data.cooldowns[key] = timestamp;
    this.save();
  }
}

module.exports = new Database();
