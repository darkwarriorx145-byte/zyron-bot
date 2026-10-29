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
  'ticketCategory',
  'ticketLogChannel',
  'ticketStaffRole',
  'ticketStaffRoles',
  'ticketNamePattern',
  'ticketAiEnabled',
  'ticketPanelChannel',
  'ticketPanelTitle',
  'ticketPanelDescription',
  'ticketPanelFooter',
  'ticketCreateLabel',
  'ticketCreateEmoji',
  'ticketButtons',
  'applicationChannel',
  'staffApplyAcceptRole',
  'staffApplyAcceptRoles',
  'appealInviteChannel',
  'warningKickThreshold',
  'staffApplyPanelTitle',
  'staffApplyPanelDescription',
  'staffApplyPanelFooter',
  'staffApplyButtonLabel',
  'staffApplyButtonEmoji',
  'staffApplyModalTitle',
  'staffApplyAcceptMessage',
  'staffApplyDenyMessage',
  'staffApplyQuestions',
  'verificationEnabled',
  'verificationChannel',
  'verificationRole',
  'verificationRoles',
  'verificationRules',
  'verificationLogChannel',
  'verificationQuestions',
  'verificationMode',
  'maintenanceMode',
  'maintenanceMessage',
  'maintenanceChannelId',
  'maintenanceAnnouncementChannelId',
  'maintenanceAllowedRoles',
  'maintenanceStartedAt',
  'maintenanceStartedBy',
  'vouchLogChannel',
  'feedbackChannel',
  'dmWarnings',
  'dmSecurity',
  'dmTicketUpdates',
  'dmFeedback',
  'ticketRatingsEnabled',
  'ticketPriorityEnabled',
  'ticketPriorities',
  'customCommandRole',
  'inviteLogChannel',
  'nicknameLogChannel',
  'bannedNickPatterns',
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
      cooldowns: {},
      tickets: {},
      staffApplications: {},
      appeals: {},
      customCommands: {},
      reactionRoles: {},
      vouches: {},
      feedback: {},
      ticketRatings: {},
      inviteUses: {},
      staffActions: {},
      staffMetrics: {}
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
        this.data.tickets = parsed.tickets || {};
        this.data.staffApplications = parsed.staffApplications || {};
        this.data.appeals = parsed.appeals || {};
        this.data.customCommands = parsed.customCommands || {};
        this.data.reactionRoles = parsed.reactionRoles || {};
        this.data.vouches = parsed.vouches || {};
        this.data.feedback = parsed.feedback || {};
        this.data.ticketRatings = parsed.ticketRatings || {};
        this.data.inviteUses = parsed.inviteUses || {};
        this.data.staffActions = parsed.staffActions || {};
        this.data.staffMetrics = parsed.staffMetrics || {};
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
        ticketStaffRoles: [],
        ticketNamePattern: 'ticket-{{ticket_number}}',
        ticketAiEnabled: true,
        ticketCounter: 0,
        ticketButtons: [],
        ticketPanelChannel: null,
        ticketPanelTitle: null,
        ticketPanelDescription: null,
        ticketPanelFooter: null,
        ticketCreateLabel: 'Create Ticket',
        ticketCreateEmoji: '🎫',
        applicationChannel: null,
        staffApplyAcceptRole: null,
        staffApplyAcceptRoles: [],
        appealInviteChannel: null,
        warningKickThreshold: 5,
        staffApplyPanelTitle: null,
        staffApplyPanelDescription: null,
        staffApplyPanelFooter: null,
        staffApplyButtonLabel: 'Apply Now',
        staffApplyButtonEmoji: '📝',
        staffApplyModalTitle: 'Staff Application',
        staffApplyAcceptMessage: null,
        staffApplyDenyMessage: null,
        staffApplyQuestions: [],
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
    if (!Array.isArray(guild.ticketStaffRoles)) guild.ticketStaffRoles = [];
    if (!guild.ticketNamePattern) guild.ticketNamePattern = 'ticket-{{ticket_number}}';
    if (guild.ticketAiEnabled === undefined) guild.ticketAiEnabled = true;
    if (!Array.isArray(guild.staffApplyAcceptRoles)) guild.staffApplyAcceptRoles = [];
    if (!guild.appealInviteChannel) guild.appealInviteChannel = null;
    if (guild.warningKickThreshold === undefined) guild.warningKickThreshold = 5;
    if (guild.ticketCounter === undefined) guild.ticketCounter = 0;
    if (!guild.ticketPanelTitle) guild.ticketPanelTitle = null;
    if (!guild.ticketPanelDescription) guild.ticketPanelDescription = null;
    if (!guild.ticketPanelFooter) guild.ticketPanelFooter = null;
    if (!guild.ticketCreateLabel) guild.ticketCreateLabel = 'Create Ticket';
    if (!guild.ticketCreateEmoji) guild.ticketCreateEmoji = '🎫';
    if (!guild.staffApplyPanelTitle) guild.staffApplyPanelTitle = null;
    if (!guild.staffApplyPanelDescription) guild.staffApplyPanelDescription = null;
    if (!guild.staffApplyPanelFooter) guild.staffApplyPanelFooter = null;
    if (!guild.staffApplyButtonLabel) guild.staffApplyButtonLabel = 'Apply Now';
    if (!guild.staffApplyButtonEmoji) guild.staffApplyButtonEmoji = '📝';
    if (!guild.staffApplyModalTitle) guild.staffApplyModalTitle = 'Staff Application';
    if (!guild.staffApplyAcceptMessage) guild.staffApplyAcceptMessage = null;
    if (!guild.staffApplyDenyMessage) guild.staffApplyDenyMessage = null;
    if (!Array.isArray(guild.staffApplyQuestions)) guild.staffApplyQuestions = [];

    if (guild.verificationEnabled === undefined) guild.verificationEnabled = false;
    if (guild.verificationChannel === undefined) guild.verificationChannel = null;
    if (guild.verificationRole === undefined) guild.verificationRole = null;
    if (!Array.isArray(guild.verificationRoles)) guild.verificationRoles = [];
    if (guild.verificationRules === undefined) guild.verificationRules = null;
    if (guild.verificationLogChannel === undefined) guild.verificationLogChannel = null;
    if (!Array.isArray(guild.verificationQuestions)) guild.verificationQuestions = [];
    if (!guild.verificationMode) guild.verificationMode = 'button';
    if (guild.maintenanceMode === undefined) guild.maintenanceMode = false;
    if (guild.maintenanceMessage === undefined) guild.maintenanceMessage = 'The server is currently under maintenance. Please check back later.';
    if (guild.maintenanceChannelId === undefined) guild.maintenanceChannelId = null;
    if (guild.maintenanceAnnouncementChannelId === undefined) guild.maintenanceAnnouncementChannelId = null;
    if (!Array.isArray(guild.maintenanceAllowedRoles)) guild.maintenanceAllowedRoles = [];
    if (guild.maintenanceStartedAt === undefined) guild.maintenanceStartedAt = null;
    if (guild.maintenanceStartedBy === undefined) guild.maintenanceStartedBy = null;
    if (guild.vouchLogChannel === undefined) guild.vouchLogChannel = null;
    if (guild.feedbackChannel === undefined) guild.feedbackChannel = null;
    if (guild.dmWarnings === undefined) guild.dmWarnings = true;
    if (guild.dmSecurity === undefined) guild.dmSecurity = true;
    if (guild.dmTicketUpdates === undefined) guild.dmTicketUpdates = true;
    if (guild.dmFeedback === undefined) guild.dmFeedback = true;
    if (guild.ticketRatingsEnabled === undefined) guild.ticketRatingsEnabled = true;
    if (guild.ticketPriorityEnabled === undefined) guild.ticketPriorityEnabled = false;
    if (!Array.isArray(guild.ticketPriorities)) guild.ticketPriorities = ['Low', 'Normal', 'High', 'Urgent'];
    if (guild.customCommandRole === undefined) guild.customCommandRole = null;
    if (guild.inviteLogChannel === undefined) guild.inviteLogChannel = null;
    if (guild.nicknameLogChannel === undefined) guild.nicknameLogChannel = null;
    if (!Array.isArray(guild.bannedNickPatterns)) guild.bannedNickPatterns = [];

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
      type: info.type ? String(info.type).slice(0, 20) : 'manual',
      source: info.source ? String(info.source).slice(0, 30) : null,
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

  // Ticket, staff-application and appeal activity.
  ensureActivity(guildId) {
    if (!this.data.tickets) this.data.tickets = {};
    if (!this.data.staffApplications) this.data.staffApplications = {};
    if (!this.data.appeals) this.data.appeals = {};
    if (!Array.isArray(this.data.tickets[guildId])) this.data.tickets[guildId] = [];
    if (!Array.isArray(this.data.staffApplications[guildId])) this.data.staffApplications[guildId] = [];
    if (!Array.isArray(this.data.appeals[guildId])) this.data.appeals[guildId] = [];
  }

  makeActivityId(prefix) {
    return String(prefix || 'z') + Date.now().toString(36) +
      Math.random().toString(36).substring(2, 7);
  }

  addTicket(guildId, data) {
    this.ensureActivity(guildId);
    const info = data || {};
    const entry = {
      id: info.id || this.makeActivityId('t'),
      number: info.number || 0,
      channelId: info.channelId || null,
      userId: info.userId || null,
      type: info.type || 'General Support',
      reason: String(info.reason || '').slice(0, 1500),
      status: info.status || 'open',
      claimedBy: info.claimedBy || null,
      closedBy: info.closedBy || null,
      closeReason: info.closeReason || null,
      aiReplies: 0,
      aiPaused: false,
      handledBy: null,
      createdAt: info.createdAt || Date.now(),
      closedAt: null
    };
    this.data.tickets[guildId].push(entry);
    this.save();
    return entry;
  }

  getTickets(guildId) {
    this.ensureActivity(guildId);
    return this.data.tickets[guildId];
  }

  getTicket(guildId, ticketId) {
    return this.getTickets(guildId).filter(function (ticket) {
      return ticket.id === ticketId;
    })[0] || null;
  }

  getTicketByChannel(guildId, channelId) {
    return this.getTickets(guildId).filter(function (ticket) {
      return ticket.channelId === channelId;
    })[0] || null;
  }

  updateTicket(guildId, ticketId, updates) {
    const ticket = this.getTicket(guildId, ticketId);
    if (!ticket) return null;
    Object.assign(ticket, updates || {});
    this.save();
    return ticket;
  }

  addStaffApplication(guildId, data) {
    this.ensureActivity(guildId);
    const info = data || {};
    const entry = {
      id: info.id || this.makeActivityId('a'),
      userId: info.userId || null,
      status: info.status || 'pending',
      channelId: info.channelId || null,
      messageId: info.messageId || null,
      reviewedBy: null,
      reviewedAt: null,
      decision: null,
      createdAt: info.createdAt || Date.now()
    };
    this.data.staffApplications[guildId].push(entry);
    this.save();
    return entry;
  }

  getStaffApplications(guildId) {
    this.ensureActivity(guildId);
    return this.data.staffApplications[guildId];
  }

  updateStaffApplication(guildId, userId, updates) {
    const list = this.getStaffApplications(guildId);
    let entry = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].userId === userId) {
        entry = list[i];
        break;
      }
    }
    if (!entry) return null;
    Object.assign(entry, updates || {});
    this.save();
    return entry;
  }

  addAppeal(guildId, data) {
    this.ensureActivity(guildId);
    const info = data || {};
    const entry = {
      id: info.id || this.makeActivityId('p'),
      userId: info.userId || null,
      action: info.action || 'kick',
      actionTaken: info.actionTaken || 'Kicked from the server',
      reason: String(info.reason || '').slice(0, 1500),
      warnings: info.warnings || 0,
      type: info.type || 'minor',
      status: 'pending',
      answers: info.answers || null,
      reviewedBy: null,
      reviewedAt: null,
      inviteUrl: null,
      channelId: info.channelId || null,
      messageId: info.messageId || null,
      createdAt: info.createdAt || Date.now()
    };
    this.data.appeals[guildId].push(entry);
    this.save();
    return entry;
  }

  getAppeals(guildId) {
    this.ensureActivity(guildId);
    return this.data.appeals[guildId];
  }

  getAppeal(guildId, caseId) {
    return this.getAppeals(guildId).filter(function (appeal) {
      return appeal.id === caseId;
    })[0] || null;
  }

  updateAppeal(guildId, caseId, updates) {
    const appeal = this.getAppeal(guildId, caseId);
    if (!appeal) return null;
    Object.assign(appeal, updates || {});
    this.save();
    return appeal;
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
