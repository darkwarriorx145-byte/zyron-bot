const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cookieSession = require('cookie-session');
const fs = require('fs');
const crypto = require('crypto');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const botApi = require('./lib/botApi');

const app = express();

const PORT = process.env.DASHBOARD_PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'ZyronDashboardSecretKey2026';
const SESSION_CRYPTO_KEY = crypto.createHash('sha256').update(String(SESSION_SECRET)).digest();
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || ('http://localhost:' + PORT + '/auth/discord/callback');
const MAIN_ADMIN_ID = String(process.env.MAIN_ADMIN_DISCORD_ID || '');
const OAUTH_READY = Boolean(CLIENT_ID && CLIENT_SECRET);
const SECURE_COOKIES = String(process.env.DASHBOARD_SECURE_COOKIES || '').toLowerCase() === 'true';
const INVITE_URL = 'https://discord.gg/NptArpkjK';
const REMOTE_MODE = botApi.isConfigured();

function oauthCallbackUrl(req) {
  const configured = String(process.env.DISCORD_REDIRECT_URI || '').trim();
  if (configured) return configured;
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
  { key: 'security', label: 'Anti-Nuke Guards', description: 'Reverts and blocks destructive staff actions.' },
  { key: 'chat', label: 'Chat Filters', description: 'Keeps conversations clean and stops spam.' },
  { key: 'recovery', label: 'Anti-Raid & Recovery', description: 'Backups, raids and automatic lockdowns.' }
];

const FEATURE_LIBRARY = [
  {
    key: 'antinuke',
    icon: 'shield',
    title: 'Anti-Nuke',
    description: 'Reverts mass bans, kicks, channel deletes, role changes and webhook abuse before the server is lost.',
    tab: 'antinuke',
    badge: '24 guards'
  },
  {
    key: 'antiraid',
    icon: 'zap',
    title: 'Anti-Raid',
    description: 'Detects join floods, locks the server down and kicks or bans raiders based on your policy.',
    tab: 'antiraid',
    badge: 'Auto lockdown'
  },
  {
    key: 'ai',
    icon: 'brain',
    title: 'AI Guard',
    description: 'OpenRouter gives a second opinion before Zyron punishes a nuke, raid or abusive message.',
    tab: 'ai',
    badge: 'Smart'
  },
  {
    key: 'automod',
    icon: 'message-square',
    title: 'AutoMod',
    description: 'Spam, invite links, mass mentions and profanity filters with clear staff logs.',
    tab: 'automod',
    badge: 'Chat safe'
  },
  {
    key: 'tickets',
    icon: 'ticket',
    title: 'Tickets',
    description: 'Design the panel, edit every button and open private support channels instantly.',
    tab: 'tickets',
    badge: 'Custom'
  },
  {
    key: 'staff',
    icon: 'user-check',
    title: 'Staff Applications',
    description: 'Build your own questions, choose the application channel and assign the accepted role automatically.',
    tab: 'staff',
    badge: 'Hiring'
  },
  {
    key: 'giveaways',
    icon: 'gift',
    title: 'Giveaways',
    description: 'Reaction giveaways with start, end and reroll controls, managed from Discord.',
    tab: 'giveaways',
    badge: 'Engagement'
  },
  {
    key: 'economy',
    icon: 'coins',
    title: 'Economy',
    description: 'A separate coin economy for every server with daily and invite rewards you control.',
    tab: 'economy',
    badge: 'Per-server'
  },
  {
    key: 'joingate',
    icon: 'shield-check',
    title: 'Join Gate 2.0',
    description: 'Scores every new member, quarantines risky accounts, runs a private challenge and gives staff one-click release or kick controls.',
    tab: 'joingate',
    badge: 'Risk scored'
  },
  {
    key: 'progression',
    icon: 'star',
    title: 'Community Progression',
    description: 'Daily and weekly quests, streaks and twelve collectible badges that appear on every member profile.',
    tab: 'progression',
    badge: 'Badges + quests'
  },
  {
    key: 'levels',
    icon: 'sparkles',
    title: 'Levels & XP',
    description: 'Message and voice XP with dashboard-tuned rates, level-up channels and automatic role rewards.',
    tab: 'levels',
    badge: 'Role rewards'
  },
  {
    key: 'shop',
    icon: 'gift',
    title: 'Coin Shop',
    description: 'Admin-controlled items, prices, stock limits and role rewards, paid with each server’s own coins.',
    tab: 'shop',
    badge: 'Admin stock'
  },
  {
    key: 'staffops',
    icon: 'users',
    title: 'Staff Operations',
    description: 'Tracks staff messages, voice, commands, tickets and moderation, then recommends who to promote, coach or demote.',
    tab: 'staffops',
    badge: 'Promotion advice'
  },
  {
    key: 'health',
    icon: 'activity',
    title: 'Server Health',
    description: 'Automatic audits report dangerous role permissions and category-grouped risks in the dashboard and in Discord.',
    tab: 'health',
    badge: 'Auto audits'
  },
  {
    key: 'integrations',
    icon: 'link',
    title: 'Integrations',
    description: 'Connect Pterodactyl, Minecraft, hosting panels, status pages, communities and more with per-service checks.',
    tab: 'integrations',
    badge: '11+ services'
  }
];

const DEFAULT_TICKET_TITLE = '🎫 Zyron Support Tickets';
const DEFAULT_TICKET_DESCRIPTION =
  'Need help from our staff team?\n\n' +
  'Click a button below and a private channel will open instantly.\n\n' +
  '{{buttons}}\n\n' +
  '**Inside a ticket**\n' +
  '• Claim — staff member takes the ticket\n' +
  '• Rename — change the ticket channel name\n' +
  '• Add User — invite someone to the ticket\n' +
  '• Remove User — remove someone from the ticket\n' +
  '• Close — delete the ticket when finished\n\n' +
  '**Rules**\n' +
  '• One ticket per member\n' +
  '• Do not open fake tickets\n' +
  '• Staff will reply as soon as possible';
const DEFAULT_TICKET_FOOTER = 'Zyron • Powered by Zyra Nodes Limited';

const DEFAULT_STAFF_TITLE = '📝 Zyron Staff Applications';
const DEFAULT_STAFF_DESCRIPTION =
  'Want to join the staff team?\n\n' +
  'Click **Apply Now** and fill in the application form.\n' +
  'Our management team will review it and reply by DM.\n\n' +
  '**Requirements**\n' +
  '• Be active in the server\n' +
  '• Be respectful and mature\n' +
  '• No recent punishments';
const DEFAULT_STAFF_FOOTER = 'Zyron • Powered by Zyra Nodes Limited';

const DEFAULT_STAFF_QUESTIONS = [
  { label: 'Name / nickname', placeholder: 'Your name or nickname', style: 'short', required: true, maxLength: 50 },
  { label: 'Age', placeholder: 'Your age', style: 'short', required: true, maxLength: 3 },
  { label: 'Timezone / country', placeholder: 'e.g. GMT+5 / India', style: 'short', required: true, maxLength: 60 },
  { label: 'Previous staff experience', placeholder: 'Servers, roles and responsibilities', style: 'paragraph', required: true, maxLength: 500 },
  { label: 'Why should we pick you?', placeholder: 'Tell us about yourself', style: 'paragraph', required: true, maxLength: 800 }
];

const TICKET_BUTTON_STYLES = ['primary', 'secondary', 'success', 'danger'];
const STAFF_QUESTION_STYLES = ['short', 'paragraph'];

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
    ticketCategory: null,
    ticketLogChannel: null,
    ticketStaffRole: null,
    ticketStaffRoles: [],
    ticketNamePattern: 'ticket-{{ticket_number}}',
    ticketAiEnabled: true,
    ticketCounter: 0,
    ticketPanelChannel: null,
    ticketPanelTitle: DEFAULT_TICKET_TITLE,
    ticketPanelDescription: DEFAULT_TICKET_DESCRIPTION,
    ticketPanelFooter: DEFAULT_TICKET_FOOTER,
    ticketCreateLabel: 'Create Ticket',
    ticketCreateEmoji: '🎫',
    ticketButtons: [],
    applicationChannel: null,
    staffApplyAcceptRole: null,
    staffApplyAcceptRoles: [],
    appealInviteChannel: null,
    warningKickThreshold: 5,
    staffApplyPanelTitle: DEFAULT_STAFF_TITLE,
    staffApplyPanelDescription: DEFAULT_STAFF_DESCRIPTION,
    staffApplyPanelFooter: DEFAULT_STAFF_FOOTER,
    staffApplyButtonLabel: 'Apply Now',
    staffApplyButtonEmoji: '📝',
    staffApplyModalTitle: 'Staff Application',
    staffApplyAcceptMessage: 'Congratulations! Your staff application in **{server}** was accepted. A manager will contact you soon.',
    staffApplyDenyMessage: 'Unfortunately your staff application in **{server}** was denied. You can apply again later.',
    staffApplyQuestions: DEFAULT_STAFF_QUESTIONS.map(function (question) {
      return Object.assign({}, question);
    }),
    verificationEnabled: false,
    verificationChannel: null,
    verificationRole: null,
    verificationRoles: [],
    verificationRules: null,
    verificationLogChannel: null,
    verificationQuestions: [],
    verificationMode: 'button',
    maintenanceMode: false,
    maintenanceMessage: 'The server is currently under maintenance. Please check back later.',
    maintenanceChannelId: null,
    maintenanceAnnouncementChannelId: null,
    maintenanceAllowedRoles: [],
    maintenanceStartedAt: null,
    maintenanceStartedBy: null,
    vouchLogChannel: null,
    feedbackChannel: null,
    dmWarnings: true,
    dmSecurity: true,
    dmTicketUpdates: true,
    dmFeedback: true,
    ticketRatingsEnabled: true,
    ticketPriorityEnabled: false,
    ticketPriorities: ['Low', 'Normal', 'High', 'Urgent'],
    customCommandRole: null,
    inviteLogChannel: null,
    nicknameLogChannel: null,
    bannedNickPatterns: [],
    levelsEnabled: false,
    xpPerMessage: 15,
    xpMessageCooldown: 60,
    xpPerVoiceMinute: 10,
    coinsPerMessage: 2,
    coinsPerVoiceMinute: 1,
    coinsPerLevel: 50,
    levelUpChannelId: null,
    levelRewards: [],
    levelUpMessage: null,
    shopEnabled: false,
    shopChannelId: null,
    shopLogChannel: null,
    serverAuditEnabled: false,
    serverAuditIntervalHours: 24,
    serverAuditChannelId: null,
    serverAuditLastAt: null,
    serverAuditReport: null,
    joinGateEnabled: false,
    joinGateChallengeEnabled: true,
    joinGateQuarantineRoleId: null,
    joinGateRiskThreshold: 60,
    joinGateMinAccountAgeDays: 7,
    joinGateHighRiskAction: 'quarantine',
    joinGateHoneypotChannelId: null,
    joinGateHoneypotAction: 'timeout',
    joinGateLogChannelId: null,
    joinGateChallengeChannelId: null,
    questsEnabled: false,
    questDailyMessages: 50,
    questDailyVoice: 30,
    questDailyCoins: 50,
    questWeeklyMessages: 250,
    questWeeklyVoice: 180,
    questWeeklyPurchases: 3,
    questWeeklyCoins: 250,
    progressionLogChannelId: null,
    staffOpsEnabled: true,
    staffLogChannelId: null,
    staffAdviceChannelId: null,
    staffPromotionThreshold: 200,
    staffInactiveDays: 14,
    staffReviewIntervalHours: 24,
    staffOpsLastReviewAt: null,
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
  if (!Array.isArray(merged.ticketButtons)) merged.ticketButtons = [];
  if (!Array.isArray(merged.ticketStaffRoles)) merged.ticketStaffRoles = [];
  if (!Array.isArray(merged.staffApplyAcceptRoles)) merged.staffApplyAcceptRoles = [];
  if (!merged.ticketNamePattern) merged.ticketNamePattern = base.ticketNamePattern;
  if (merged.ticketAiEnabled === undefined) merged.ticketAiEnabled = true;
  if (merged.warningKickThreshold === undefined) merged.warningKickThreshold = 5;
  if (!Array.isArray(merged.staffApplyQuestions) || merged.staffApplyQuestions.length === 0) {
    merged.staffApplyQuestions = base.staffApplyQuestions.map(function (question) {
      return Object.assign({}, question);
    });
  }
  if (!merged.ticketPanelTitle) merged.ticketPanelTitle = base.ticketPanelTitle;
  if (!merged.ticketPanelDescription) merged.ticketPanelDescription = base.ticketPanelDescription;
  if (!merged.ticketPanelFooter) merged.ticketPanelFooter = base.ticketPanelFooter;
  if (!merged.ticketCreateLabel) merged.ticketCreateLabel = base.ticketCreateLabel;
  if (!merged.ticketCreateEmoji) merged.ticketCreateEmoji = base.ticketCreateEmoji;
  if (!merged.staffApplyPanelTitle) merged.staffApplyPanelTitle = base.staffApplyPanelTitle;
  if (!merged.staffApplyPanelDescription) merged.staffApplyPanelDescription = base.staffApplyPanelDescription;
  if (!merged.staffApplyPanelFooter) merged.staffApplyPanelFooter = base.staffApplyPanelFooter;
  if (!merged.staffApplyButtonLabel) merged.staffApplyButtonLabel = base.staffApplyButtonLabel;
  if (!merged.staffApplyButtonEmoji) merged.staffApplyButtonEmoji = base.staffApplyButtonEmoji;
  if (!merged.staffApplyModalTitle) merged.staffApplyModalTitle = base.staffApplyModalTitle;
  if (!Array.isArray(merged.verificationRoles)) merged.verificationRoles = [];
  if (!Array.isArray(merged.verificationQuestions)) merged.verificationQuestions = [];
  if (!merged.verificationMode) merged.verificationMode = 'button';
  if (!Array.isArray(merged.maintenanceAllowedRoles)) merged.maintenanceAllowedRoles = [];
  if (!Array.isArray(merged.ticketPriorities) || merged.ticketPriorities.length === 0) {
    merged.ticketPriorities = base.ticketPriorities.slice();
  }
  if (!Array.isArray(merged.bannedNickPatterns)) merged.bannedNickPatterns = [];
  if (!Array.isArray(merged.levelRewards)) merged.levelRewards = [];
  if (merged.serverAuditIntervalHours === undefined) merged.serverAuditIntervalHours = 24;
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

function localActivity(guildId) {
  const data = readBotDB();
  const tickets = Array.isArray(data.tickets && data.tickets[guildId]) ? data.tickets[guildId] : [];
  const applications = Array.isArray(data.staffApplications && data.staffApplications[guildId])
    ? data.staffApplications[guildId]
    : [];
  const appeals = Array.isArray(data.appeals && data.appeals[guildId]) ? data.appeals[guildId] : [];
  const counts = {};
  tickets.forEach(function (ticket) {
    if (ticket.status !== 'closed' || !ticket.closedBy) return;
    counts[ticket.closedBy] = (counts[ticket.closedBy] || 0) + 1;
  });
  const closedBy = Object.keys(counts).map(function (userId) {
    return { userId: userId, name: userId, count: counts[userId] };
  }).sort(function (a, b) { return b.count - a.count; });

  const joinGateEvents = Array.isArray(data.joinGateEvents && data.joinGateEvents[guildId])
    ? data.joinGateEvents[guildId].slice().reverse()
    : [];
  const joinGateStats = {
    total: joinGateEvents.filter(function (event) { return event.type === 'join'; }).length,
    pending: joinGateEvents.filter(function (event) { return event.status === 'pending' || event.status === 'flagged'; }).length,
    verified: joinGateEvents.filter(function (event) { return event.status === 'verified' || event.status === 'released'; }).length,
    blocked: joinGateEvents.filter(function (event) { return event.status === 'kicked' || event.status === 'blocked'; }).length,
    honeypot: joinGateEvents.filter(function (event) { return event.type === 'honeypot'; }).length
  };

  const progressionData = data.progression && data.progression[guildId] ? data.progression[guildId] : {};
  const badgeCounts = {};
  Object.keys(progressionData).forEach(function (userId) {
    const badges = progressionData[userId] && progressionData[userId].badges ? progressionData[userId].badges : {};
    Object.keys(badges).forEach(function (badgeId) {
      badgeCounts[badgeId] = (badgeCounts[badgeId] || 0) + 1;
    });
  });
  const progressionBadges = Object.keys(badgeCounts).map(function (badgeId) {
    return { id: badgeId, name: badgeId.replace(/_/g, ' '), emoji: '🏅', description: '', count: badgeCounts[badgeId] };
  });
  const progressionLeaderboard = Object.keys(progressionData).map(function (userId) {
    const record = progressionData[userId] || {};
    const levelRecord = data.levels && data.levels[guildId] ? data.levels[guildId][userId] || {} : {};
    return {
      userId: userId,
      level: levelRecord.level || 0,
      totalXp: levelRecord.totalXp || 0,
      badgeCount: Object.keys(record.badges || {}).length,
      questsCompleted: record.totals && record.totals.questsCompleted ? record.totals.questsCompleted : 0,
      streak: record.streak && record.streak.count ? record.streak.count : 0
    };
  }).sort(function (a, b) {
    if (b.badgeCount !== a.badgeCount) return b.badgeCount - a.badgeCount;
    return b.totalXp - a.totalXp;
  }).slice(0, 10);

  const staffRecentActions = Array.isArray(data.staffActions && data.staffActions[guildId])
    ? data.staffActions[guildId].slice(-25).reverse()
    : [];
  const staffMetricsMap = data.staffMetrics && data.staffMetrics[guildId] ? data.staffMetrics[guildId] : {};
  const staffMetricsList = Object.keys(staffMetricsMap).map(function (userId) {
    return Object.assign({ userId: userId }, staffMetricsMap[userId]);
  });

  return {
    tickets: tickets.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 25),
    staffApplications: applications.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 25),
    appeals: appeals.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 25),
    ticketStats: {
      total: tickets.length,
      open: tickets.filter(function (t) { return t.status === 'open'; }).length,
      closed: tickets.filter(function (t) { return t.status === 'closed'; }).length,
      closedBy: closedBy
    },
    staffStats: {
      total: applications.length,
      pending: applications.filter(function (a) { return a.status === 'pending'; }).length,
      accepted: applications.filter(function (a) { return a.status === 'accepted'; }).length,
      denied: applications.filter(function (a) { return a.status === 'denied'; }).length,
      reviewedBy: []
    },
    appealStats: {
      total: appeals.length,
      pending: appeals.filter(function (a) { return a.status === 'pending'; }).length,
      approved: appeals.filter(function (a) { return a.status === 'approved'; }).length,
      denied: appeals.filter(function (a) { return a.status === 'denied'; }).length
    },
    staffAdvice: closedBy.slice(0, 8).map(function (row) {
      return {
        userId: row.userId,
        name: row.name,
        closes: row.count,
        action: row.count >= 3 ? 'promote' : 'demote',
        reason: row.count >= 3
          ? 'they closed ' + row.count + ' tickets'
          : 'they have no recent ticket closes'
      };
    }),
    vouches: Array.isArray(data.vouches && data.vouches[guildId]) ? data.vouches[guildId] : [],
    vouchStats: { total: 0, average: 0, leaderboard: [] },
    ticketRatings: { total: 0, average: 0, recent: [], enabled: true, priorityEnabled: false },
    staffMetrics: {},
    staffLeaderboard: [],
    staffAdviceExtended: [],
    customCommands: Array.isArray(data.customCommands && data.customCommands[guildId]) ? data.customCommands[guildId] : [],
    reactionRoles: Array.isArray(data.reactionRoles && data.reactionRoles[guildId]) ? data.reactionRoles[guildId] : [],
    inviteLeaderboard: [],
    maintenanceMode: false,
    levelsLeaderboard: Object.keys(data.levels && data.levels[guildId] ? data.levels[guildId] : {}).map(function (userId) {
      const record = data.levels[guildId][userId] || {};
      return {
        userId: userId,
        totalXp: record.totalXp || 0,
        level: record.level || 0,
        messages: record.messages || 0,
        voiceMinutes: record.voiceMinutes || 0,
        coinsEarned: record.coinsEarned || 0
      };
    }).sort(function (a, b) { return b.totalXp - a.totalXp; }).slice(0, 10),
    shopItems: Array.isArray(data.shops && data.shops[guildId]) ? data.shops[guildId] : [],
    purchases: Array.isArray(data.purchases && data.purchases[guildId]) ? data.purchases[guildId].slice(-25).reverse() : [],
    healthReport: data.guilds && data.guilds[guildId] ? (data.guilds[guildId].serverAuditReport || null) : null,
    integrations: Array.isArray(data.integrations && data.integrations[guildId]) ? data.integrations[guildId] : [],
    tempActions: Array.isArray(data.tempActions && data.tempActions[guildId]) ? data.tempActions[guildId] : [],
    schedules: Array.isArray(data.schedules && data.schedules[guildId]) ? data.schedules[guildId] : [],
    joinGate: { stats: joinGateStats, events: joinGateEvents.slice(0, 50) },
    progressionBadges: progressionBadges,
    progressionLeaderboard: progressionLeaderboard,
    staffRecentActions: staffRecentActions,
    staffOpsStats: {
      tracked: staffMetricsList.length,
      activeThisWeek: staffMetricsList.filter(function (row) {
        return (row.lastActive || 0) >= Date.now() - 7 * 86400000;
      }).length,
      promotionReady: 0
    }
  };
}

async function loadGuildActivity(guildId) {
  if (REMOTE_MODE) {
    try {
      const result = await botApi.getActivity(guildId);
      return result.activity;
    } catch (err) {
      console.warn('Bot API activity lookup failed; using local bot DB:', err.message);
    }
  }
  return localActivity(guildId);
}

async function loadUserProfile(guildId, userId) {
  if (REMOTE_MODE) {
    try {
      const result = await botApi.getUserProfile(guildId, userId);
      if (result && result.profile) {
        return Object.assign({}, result.profile, { staff: result.staff || null });
      }
    } catch (err) {
      console.warn('Bot API profile lookup failed; using local bot DB:', err.message);
    }
  }

  const data = readBotDB();
  const levelRecord = data.levels && data.levels[guildId] ? data.levels[guildId][userId] || {} : {};
  const progression = data.progression && data.progression[guildId] ? data.progression[guildId][userId] || {} : {};
  const invites = data.invites && data.invites[guildId] ? data.invites[guildId][userId] || {} : {};
  const coins = data.coins && data.coins[guildId] ? data.coins[guildId][userId] || 0 : 0;
  const messages = data.messages && data.messages[guildId] ? data.messages[guildId][userId] || 0 : 0;
  const warnings = data.warnings && data.warnings[guildId + '_' + userId] ? data.warnings[guildId + '_' + userId] : [];
  const staffRecord = data.staffMetrics && data.staffMetrics[guildId] ? data.staffMetrics[guildId][userId] || null : null;
  const badges = Object.keys(progression.badges || {}).map(function (badgeId) {
    return {
      id: badgeId,
      name: badgeId.replace(/_/g, ' '),
      emoji: '🏅',
      description: '',
      unlocked: true,
      unlockedAt: progression.badges[badgeId],
      progress: 100
    };
  });
  const levelStore = data.levels && data.levels[guildId] ? data.levels[guildId] : {};
  const sorted = Object.keys(levelStore).sort(function (a, b) {
    return (levelStore[b].totalXp || 0) - (levelStore[a].totalXp || 0);
  });

  return {
    userId: userId,
    username: null,
    displayName: null,
    avatar: null,
    joinedAt: null,
    level: levelRecord.level || 0,
    totalXp: levelRecord.totalXp || 0,
    rank: sorted.indexOf(userId) === -1 ? sorted.length + 1 : sorted.indexOf(userId) + 1,
    totalRanked: sorted.length,
    progress: 0,
    needed: 100,
    coins: coins,
    coinsEarned: levelRecord.coinsEarned || 0,
    messages: Math.max(messages, levelRecord.messages || 0),
    voiceMinutes: levelRecord.voiceMinutes || 0,
    invites: invites.real || invites.total || 0,
    purchases: 0,
    questsCompleted: progression.totals && progression.totals.questsCompleted ? progression.totals.questsCompleted : 0,
    streak: progression.streak && progression.streak.count ? progression.streak.count : 0,
    vouches: 0,
    warnings: warnings.length,
    badges: badges,
    badgeCount: badges.length,
    totalBadges: badges.length,
    quests: [],
    questsEnabled: false,
    staff: staffRecord
  };
}

function emptyViewerProfile(user) {
  return {
    userId: user && user.id ? user.id : '',
    username: user && user.displayName ? user.displayName : null,
    displayName: user && user.displayName ? user.displayName : null,
    avatar: null,
    joinedAt: null,
    level: 0,
    totalXp: 0,
    rank: 1,
    totalRanked: 0,
    progress: 0,
    needed: 100,
    coins: 0,
    coinsEarned: 0,
    messages: 0,
    voiceMinutes: 0,
    invites: 0,
    purchases: 0,
    questsCompleted: 0,
    streak: 0,
    vouches: 0,
    warnings: 0,
    badges: [],
    badgeCount: 0,
    totalBadges: 12,
    quests: [],
    questsEnabled: false,
    staff: null
  };
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

function sanitizeTicketButtons(list) {
  const buttons = [];
  if (!Array.isArray(list)) return buttons;

  list.slice(0, 9).forEach(function (button) {
    if (!button || typeof button !== 'object') return;
    const label = cleanText(button.label, 80);
    if (!label) return;
    const style = TICKET_BUTTON_STYLES.indexOf(button.style) !== -1 ? button.style : 'secondary';
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
    const style = STAFF_QUESTION_STYLES.indexOf(question.style) !== -1 ? question.style : 'short';
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

function buttonStyleId(style) {
  if (style === 'primary') return 1;
  if (style === 'success') return 3;
  if (style === 'danger') return 4;
  return 2;
}

function emojiPayload(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const custom = /^<a?:([a-zA-Z0-9_]+):(\d+)>$/.exec(text);
  if (custom) {
    return { name: custom[1], id: custom[2], animated: text.indexOf('<a:') === 0 };
  }
  return { name: text };
}

function ticketButtonLines(buttons) {
  if (!buttons || buttons.length === 0) return '';
  return '**Ticket Types**\n' + buttons.map(function (button) {
    return '• ' + (button.emoji ? button.emoji + ' ' : '') + '**' + button.label + '** — ' + button.message;
  }).join('\n');
}

function buildTicketComponents(settings) {
  const components = [
    {
      type: 2,
      style: 1,
      label: settings.ticketCreateLabel || 'Create Ticket',
      custom_id: 'ticket:create',
      emoji: emojiPayload(settings.ticketCreateEmoji || '🎫')
    }
  ];

  (settings.ticketButtons || []).slice(0, 9).forEach(function (button, index) {
    components.push({
      type: 2,
      style: buttonStyleId(button.style),
      label: button.label,
      custom_id: 'ticket:custom:' + index,
      emoji: emojiPayload(button.emoji || '🎫')
    });
  });

  const rows = [];
  for (let i = 0; i < components.length; i += 5) {
    rows.push({ type: 1, components: components.slice(i, i + 5) });
  }
  return rows;
}

function ticketPanelPayload(settings) {
  const descriptionTemplate = settings.ticketPanelDescription || DEFAULT_TICKET_DESCRIPTION;
  const description = descriptionTemplate.split('{{buttons}}').join(ticketButtonLines(settings.ticketButtons || []));

  return {
    embeds: [
      {
        color: 0x5865f2,
        title: settings.ticketPanelTitle || DEFAULT_TICKET_TITLE,
        description: description.slice(0, 4096),
        footer: { text: (settings.ticketPanelFooter || DEFAULT_TICKET_FOOTER).slice(0, 2048) },
        timestamp: new Date().toISOString()
      }
    ],
    components: buildTicketComponents(settings)
  };
}

function staffPanelPayload(settings) {
  return {
    embeds: [
      {
        color: 0x5865f2,
        title: settings.staffApplyPanelTitle || DEFAULT_STAFF_TITLE,
        description: (settings.staffApplyPanelDescription || DEFAULT_STAFF_DESCRIPTION).slice(0, 4096),
        footer: { text: (settings.staffApplyPanelFooter || DEFAULT_STAFF_FOOTER).slice(0, 2048) },
        timestamp: new Date().toISOString()
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: settings.staffApplyButtonLabel || 'Apply Now',
            custom_id: 'staff-apply:open',
            emoji: emojiPayload(settings.staffApplyButtonEmoji || '📝')
          }
        ]
      }
    ]
  };
}

async function sendDiscordPanel(channelId, payload) {
  const token = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '';
  if (!token) throw new Error('BOT_TOKEN is not set on the dashboard.');
  if (!/^\d{5,25}$/.test(String(channelId || ''))) throw new Error('Enter a valid Discord channel ID.');

  const response = await axios.post(
    'https://discord.com/api/v10/channels/' + channelId + '/messages',
    payload,
    {
      headers: {
        Authorization: 'Bot ' + token,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  return response.data || {};
}

const aiModelCooldowns = new Map();

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
      max_tokens: 300
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
    process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free',
    process.env.OPENROUTER_FALLBACK_MODEL || 'recursive/flint-v1.0:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'recursive/flint-v1.0:free',
    'meta-llama/llama-3.3-70b-instruct:free',
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
  let skipped = 0;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (!model || tried.indexOf(model) !== -1) continue;
    if (aiModelCooldowns.has(model) && aiModelCooldowns.get(model) > Date.now()) {
      skipped += 1;
      continue;
    }
    tried.push(model);

    let result = await callOpenRouter(model, system, user, true);

    if (!result.ok && (result.status === 400 || result.status === 422)) {
      result = await callOpenRouter(model, system, user, false);
    }

    if (result.ok) {
      result.tried = tried;
      return result;
    }
    if (result.error) lastError = result.error;

    if (result.status === 402 || result.status === 404 || result.status === 429) {
      const waitMs = result.status === 429 ? 60 * 1000 : 10 * 60 * 1000;
      aiModelCooldowns.set(model, Date.now() + waitMs);
    }
  }

  return {
    ok: false,
    tried: tried,
    error: skipped > 0 && tried.length === 0
      ? 'AI providers are cooling down after recent errors. Try again in a minute.'
      : (lastError || 'No AI model answered. Check the OpenRouter key and credits.')
  };
}

function encryptSessionValue(value) {
  if (!value) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_CRYPTO_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('base64url') + '.' + tag.toString('base64url') + '.' + encrypted.toString('base64url');
  } catch (err) {
    return null;
  }
}

function decryptSessionValue(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_CRYPTO_KEY, Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

function discordSessionExpired(req, res) {
  if (req.path.indexOf('/api/') === 0) {
    return res.status(401).json({ ok: false, error: 'Your Discord session expired. Please sign in again.' });
  }
  return res.redirect('/login?error=' + encodeURIComponent('Your Discord session expired. Please sign in again.') + '&stage=discord-session-rejected');
}

function pathNeedsDiscordGuilds(pathname) {
  return pathname === '/dashboard' ||
    pathname === '/admin' ||
    pathname.indexOf('/server/') === 0 ||
    pathname.indexOf('/api/server/') === 0 ||
    pathname.indexOf('/api/ai/') === 0;
}

async function fetchDiscordUserGuilds(accessToken) {
  const response = await axios.get('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: 'Bearer ' + accessToken },
    timeout: 10000
  });
  return Array.isArray(response.data) ? response.data : [];
}

passport.serializeUser(function (user, done) {
  if (!user || !user.id) return done(null, null);
  // Keep the session cookie tiny. Storing every manageable guild here can exceed
  // the browser's ~4 KB cookie limit and cause an OAuth login loop.
  done(null, {
    id: user.id,
    username: user.username,
    global_name: user.global_name || null,
    discriminator: user.discriminator || '0',
    avatar: user.avatar || null,
    accessTokenEnc: encryptSessionValue(user.accessToken),
    refreshTokenEnc: encryptSessionValue(user.refreshToken)
  });
});

passport.deserializeUser(function (user, done) {
  if (!user || !user.id) return done(null, null);

  const plain = {
    id: user.id,
    username: user.username,
    global_name: user.global_name || null,
    discriminator: user.discriminator || '0',
    avatar: user.avatar || null
  };

  const accessToken = decryptSessionValue(user.accessTokenEnc);
  const refreshToken = decryptSessionValue(user.refreshTokenEnc);
  if (accessToken) {
    Object.defineProperty(plain, 'accessToken', { value: accessToken, enumerable: false, configurable: true });
  }
  if (refreshToken) {
    Object.defineProperty(plain, 'refreshToken', { value: refreshToken, enumerable: false, configurable: true });
  }
  if (!accessToken && Array.isArray(user.guilds) && user.guilds.length > 0) {
    plain.guilds = user.guilds;
  }

  done(null, plain);
});

if (OAUTH_READY) {
  passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: REDIRECT_URI,
    scope: ['identify', 'guilds']
  }, function (accessToken, refreshToken, profile, done) {
    Object.defineProperty(profile, 'accessToken', { value: accessToken, enumerable: false, configurable: true });
    Object.defineProperty(profile, 'refreshToken', { value: refreshToken || null, enumerable: false, configurable: true });
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
        // Passport keeps a reference to this same session object while it
        // regenerates. Replacing req.session here would make Passport write
        // the logged-in user into an object cookie-session no longer saves.
        Object.keys(session).forEach(function (key) {
          delete session[key];
        });
        addPassportCompat(session);
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

const discordGuildCache = new Map();
const DISCORD_GUILD_CACHE_MS = 5 * 60 * 1000;

app.use(async function (req, res, next) {
  if (!pathNeedsDiscordGuilds(req.path)) return next();
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) return next();

  if (!req.user.accessToken) {
    if (Array.isArray(req.user.guilds) && req.user.guilds.length > 0) return next();
    req.session = null;
    return discordSessionExpired(req, res);
  }

  const cached = discordGuildCache.get(req.user.id);
  if (cached && cached.expires > Date.now()) {
    req.user.guilds = cached.guilds;
    return next();
  }

  try {
    const guilds = await fetchDiscordUserGuilds(req.user.accessToken);
    discordGuildCache.set(req.user.id, {
      guilds: guilds,
      expires: Date.now() + DISCORD_GUILD_CACHE_MS
    });
    req.user.guilds = guilds;
    return next();
  } catch (err) {
    const status = err && err.response && err.response.status;
    if (status === 401) {
      req.session = null;
      return discordSessionExpired(req, res);
    }
    if (cached && Array.isArray(cached.guilds)) {
      req.user.guilds = cached.guilds;
      return next();
    }
    return next(err);
  }
});

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
  if (req.path.indexOf('/api/') === 0) {
    return res.status(401).json({ ok: false, error: 'Your dashboard session expired. Refresh the page and sign in again.' });
  }
  return res.redirect('/login?error=' + encodeURIComponent('Please sign in again. Your dashboard session was not saved or has expired.') + '&stage=no-session');
}

function requireMainAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    if (req.path.indexOf('/api/') === 0) {
      return res.status(401).json({ ok: false, error: 'Your dashboard session expired. Refresh the page and sign in again.' });
    }
    return res.redirect('/login');
  }
  if (!isMainAdmin(req.user)) {
    if (req.path.indexOf('/api/') === 0) {
      return res.status(403).json({ ok: false, error: 'You do not have access to the main admin panel.' });
    }
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
  res.clearCookie('zyron.sid', { path: '/', secure: SECURE_COOKIES, sameSite: 'lax' });
  res.clearCookie('zyron.sid.sig', { path: '/', secure: SECURE_COOKIES, sameSite: 'lax' });
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
    configuredRedirect: REDIRECT_URI,
    sessionMode: 'oauth-token-cookie',
    guildSource: 'discord-oauth-cache'
  });
});

app.get('/auth/oauth-check', async function (req, res) {
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update('zyron-oauth-check-v1').digest('hex');
  if (String(req.query.key || '') !== expected) return res.status(404).end();
  if (!OAUTH_READY) return res.json({ ok: false, error: 'not-configured' });

  try {
    const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' });
    const response = await axios.post('https://discord.com/api/oauth2/token', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      timeout: 15000
    });
    return res.json({
      ok: true,
      status: response.status,
      hasAccessToken: Boolean(response.data && response.data.access_token),
      callbackURL: oauthCallbackUrl(req)
    });
  } catch (err) {
    const data = err && err.response && err.response.data;
    return res.json({
      ok: false,
      status: err && err.response ? err.response.status : 0,
      error: data && data.error ? data.error : 'request-failed',
      callbackURL: oauthCallbackUrl(req)
    });
  }
});

app.get('/auth/session-check', function (req, res) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.status(403).json({ ok: false, error: 'Sign out before running the session check.' });
  }

  if (req.query.start === '1') {
    const heldSession = req.session;
    heldSession.diagBefore = 'yes';
    return heldSession.regenerate(function () {
      // Passport writes to the session reference it held before regenerate().
      heldSession.diagAfterRegenerate = 'yes';
      return res.redirect('/auth/session-check');
    });
  }

  return res.json({
    ok: true,
    sessionMode: 'oauth-token-cookie',
    regeneratePreserved: Boolean(req.session && req.session.diagAfterRegenerate === 'yes'),
    oldDataCleared: !(req.session && req.session.diagBefore === 'yes')
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

function oauthErrorCode(err) {
  const data = err && err.response && err.response.data;
  if (data && data.error) return String(data.error);
  if (err && err.code) return String(err.code);
  return 'unknown';
}

app.get('/auth/discord/callback', function (req, res, next) {
  if (!OAUTH_READY) {
    return res.redirect('/login?error=' + encodeURIComponent('Discord OAuth is not configured on this dashboard.') + '&stage=not-configured');
  }

  const callbackURL = oauthCallbackUrl(req);
  return passport.authenticate('discord', { callbackURL: callbackURL }, function (err, user) {
    if (err) {
      const code = oauthErrorCode(err);
      console.error('Discord OAuth callback error:', code);
      req.session = null;
      return res.redirect('/login?error=' + encodeURIComponent('Discord login failed (' + code + '). Please try again.') + '&stage=token-exchange');
    }
    if (!user) {
      return res.redirect('/login?error=' + encodeURIComponent('Discord login was cancelled or denied.') + '&stage=no-user');
    }
    return req.logIn(user, function (loginErr) {
      if (loginErr) {
        console.error('Discord session creation error:', loginErr && loginErr.message ? loginErr.message : loginErr);
        req.session = null;
        return res.redirect('/login?error=' + encodeURIComponent('Could not create your dashboard session. Please try again.') + '&stage=session-create');
      }
      return res.redirect('/auth/complete');
    });
  })(req, res, next);
});

app.get('/auth/complete', function (req, res) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.redirect('/login?error=' + encodeURIComponent('Discord login finished, but the dashboard session could not be read back. Please enable cookies for this site and try again.') + '&stage=session-readback');
  }
  if (!req.user.accessToken && !(Array.isArray(req.user.guilds) && req.user.guilds.length > 0)) {
    return res.redirect('/login?error=' + encodeURIComponent('Discord login finished, but the Discord access token was not saved. Please sign in again.') + '&stage=missing-token');
  }
  return res.redirect('/dashboard');
});

app.get('/logout', function (req, res) {
  req.session = null;
  res.clearCookie('zyron.sid', { path: '/', secure: SECURE_COOKIES, sameSite: 'lax' });
  res.clearCookie('zyron.sid.sig', { path: '/', secure: SECURE_COOKIES, sameSite: 'lax' });
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
    const primaryServer = guilds.filter(function (guild) { return guild.hasBot; })[0] || guilds[0] || null;

    return res.render('server-picker', {
      servers: guilds,
      stats: {
        total: guilds.length,
        withBot: withBot,
        withoutBot: guilds.length - withBot
      },
      featureLibrary: FEATURE_LIBRARY,
      primaryServerId: primaryServer ? primaryServer.id : null,
      botGuildCount: Object.keys(botMap).length,
      botApiOnline: REMOTE_MODE ? botApiReachable : null,
      botGuildSource: botGuildCache.source,
      botTokenConfigured: Boolean(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN),
      aiReady: Boolean(process.env.OPENROUTER_API_KEY)
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
    let activity = null;
    try {
      activity = await loadGuildActivity(serverId);
    } catch (err) {
      console.warn('Could not load server activity:', err.message);
    }

    let viewerProfile = emptyViewerProfile(req.user);
    try {
      const loadedProfile = await loadUserProfile(serverId, req.user.id);
      if (loadedProfile) viewerProfile = loadedProfile;
    } catch (err) {
      console.warn('Could not load viewer profile:', err.message);
    }

    return res.render('server', {
      serverId: serverId,
      serverName: (userGuild && userGuild.name) || (botGuild && botGuild.name) || ('Server ' + serverId),
      serverIcon: guildIconUrl(serverId, (userGuild && userGuild.icon) || (botGuild && botGuild.icon)),
      settings: settings,
      activity: activity || {
        tickets: [],
        staffApplications: [],
        appeals: [],
        ticketStats: { total: 0, open: 0, closed: 0, closedBy: [] },
        staffStats: { total: 0, pending: 0, accepted: 0, denied: 0, reviewedBy: [] },
        appealStats: { total: 0, pending: 0, approved: 0, denied: 0 },
        staffAdvice: [],
        vouches: [],
        vouchStats: { total: 0, average: 0, leaderboard: [] },
        ticketRatings: { total: 0, average: 0, recent: [], enabled: true, priorityEnabled: false },
        staffMetrics: {},
        staffLeaderboard: [],
        staffAdviceExtended: [],
        customCommands: [],
        reactionRoles: [],
        inviteLeaderboard: [],
        maintenanceMode: false,
        levelsLeaderboard: [],
        shopItems: [],
        purchases: [],
        healthReport: null,
        integrations: [],
        tempActions: [],
        schedules: [],
        joinGate: { stats: { total: 0, pending: 0, verified: 0, blocked: 0, honeypot: 0 }, events: [] },
        progressionBadges: [],
        progressionLeaderboard: [],
        staffRecentActions: [],
        staffOpsStats: { tracked: 0, activeThisWeek: 0, promotionReady: 0 }
      },
      viewerProfile: viewerProfile,
      featureCatalog: FEATURE_CATALOG,
      featureGroups: FEATURE_GROUPS,
      featureLibrary: FEATURE_LIBRARY,
      initialTab: String(req.query.tab || 'overview').replace(/[^a-z-]/g, ''),
      aiReady: Boolean(process.env.OPENROUTER_API_KEY),
      defaultModel: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      botApiOnline: REMOTE_MODE ? botApiReachable : null,
      botTokenConfigured: Boolean(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN),
      ticketButtonStyles: TICKET_BUTTON_STYLES,
      staffQuestionStyles: STAFF_QUESTION_STYLES,
      defaultTicketTitle: DEFAULT_TICKET_TITLE,
      defaultTicketDescription: DEFAULT_TICKET_DESCRIPTION,
      defaultTicketFooter: DEFAULT_TICKET_FOOTER,
      defaultStaffTitle: DEFAULT_STAFF_TITLE,
      defaultStaffDescription: DEFAULT_STAFF_DESCRIPTION,
      defaultStaffFooter: DEFAULT_STAFF_FOOTER,
      defaultStaffQuestions: DEFAULT_STAFF_QUESTIONS
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
    updates.ticketNamePattern = body.ticketNamePattern.trim().slice(0, 100) || 'ticket-{{ticket_number}}';
  }

  if (Array.isArray(body.ticketStaffRoles)) {
    updates.ticketStaffRoles = body.ticketStaffRoles
      .map(function (id) { return cleanId(id); })
      .filter(Boolean)
      .slice(0, 10);
  }

  if (Array.isArray(body.staffApplyAcceptRoles)) {
    updates.staffApplyAcceptRoles = body.staffApplyAcceptRoles
      .map(function (id) { return cleanId(id); })
      .filter(Boolean)
      .slice(0, 10);
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
    'maintenanceAnnouncementChannelId',
    'levelUpChannelId',
    'shopChannelId',
    'shopLogChannel',
    'serverAuditChannelId',
    'joinGateQuarantineRoleId',
    'joinGateHoneypotChannelId',
    'joinGateLogChannelId',
    'joinGateChallengeChannelId',
    'progressionLogChannelId',
    'staffLogChannelId',
    'staffAdviceChannelId'
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
    'ticketPriorityEnabled',
    'levelsEnabled',
    'shopEnabled',
    'serverAuditEnabled',
    'joinGateEnabled',
    'joinGateChallengeEnabled',
    'questsEnabled',
    'staffOpsEnabled'
  ];
  booleanFields.forEach(function (field) {
    if (body[field] !== undefined) updates[field] = Boolean(body[field]);
  });

  if (['quarantine', 'kick', 'log'].indexOf(body.joinGateHighRiskAction) !== -1) {
    updates.joinGateHighRiskAction = body.joinGateHighRiskAction;
  }
  if (['timeout', 'kick', 'ban'].indexOf(body.joinGateHoneypotAction) !== -1) {
    updates.joinGateHoneypotAction = body.joinGateHoneypotAction;
  }

  if (typeof body.verificationRules === 'string' || body.verificationRules === null) {
    updates.verificationRules = cleanText(body.verificationRules, 4000);
  }
  if (typeof body.verificationMode === 'string' && ['button', 'dm', 'channel'].indexOf(body.verificationMode) !== -1) {
    updates.verificationMode = body.verificationMode;
  }
  if (Array.isArray(body.verificationRoles)) {
    updates.verificationRoles = body.verificationRoles.map(function (id) { return cleanId(id); }).filter(Boolean).slice(0, 10);
  }
  if (Array.isArray(body.maintenanceAllowedRoles)) {
    updates.maintenanceAllowedRoles = body.maintenanceAllowedRoles.map(function (id) { return cleanId(id); }).filter(Boolean).slice(0, 10);
  }
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
  if (typeof body.maintenanceMessage === 'string') {
    updates.maintenanceMessage = cleanText(body.maintenanceMessage, 2000);
  }

  const growthNumbers = {
    xpPerMessage: [0, 1000],
    xpMessageCooldown: [0, 86400],
    xpPerVoiceMinute: [0, 1000],
    coinsPerMessage: [0, 100000],
    coinsPerVoiceMinute: [0, 100000],
    coinsPerLevel: [0, 100000],
    serverAuditIntervalHours: [1, 720],
    joinGateRiskThreshold: [0, 100],
    joinGateMinAccountAgeDays: [0, 365],
    questDailyMessages: [1, 100000],
    questDailyVoice: [1, 100000],
    questDailyCoins: [0, 100000],
    questWeeklyMessages: [1, 100000],
    questWeeklyVoice: [1, 100000],
    questWeeklyPurchases: [1, 10000],
    questWeeklyCoins: [0, 100000],
    staffPromotionThreshold: [10, 100000],
    staffInactiveDays: [1, 3650],
    staffReviewIntervalHours: [1, 720]
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
    }).filter(Boolean).slice(0, 50).sort(function (a, b) { return a.level - b.level; });
  }

  if (body.levelUpMessage !== undefined) updates.levelUpMessage = cleanText(body.levelUpMessage, 500);

  if (body.serverAuditEnabled === true && !existing.serverAuditEnabled) {
    updates.serverAuditLastAt = Date.now();
  }

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

app.get('/api/server/:id/picker', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }
  if (!REMOTE_MODE) {
    return res.status(503).json({ ok: false, error: 'Start the bot API to load channels and roles.' });
  }
  try {
    const channelsResult = await botApi.listChannels(serverId);
    const rolesResult = await botApi.listRoles(serverId);
    return res.json({ ok: true, channels: channelsResult.channels || [], roles: rolesResult.roles || [] });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

async function relayBotAction(req, res, runner) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }
  if (!REMOTE_MODE) {
    return res.status(503).json({ ok: false, error: 'Start the bot API to use this feature.' });
  }
  try {
    const result = await runner(serverId, req.body || {});
    return res.json(Object.assign({ ok: true }, result || {}));
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}

app.post('/api/server/:id/custom-command', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    if (body.deleteId) return botApi.deleteCustomCommand(serverId, body.deleteId);
    if (body.updateId) return botApi.updateCustomCommand(serverId, body.updateId, body.command || {});
    return botApi.createCustomCommand(serverId, body.command || body);
  });
});

app.post('/api/server/:id/reaction-role', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    if (body.deleteId) return botApi.deleteReactionRole(serverId, body.deleteId);
    if (body.publishId) return botApi.publishReactionRole(serverId, body.publishId);
    return botApi.createReactionRole(serverId, body);
  });
});

app.post('/api/server/:id/verification', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    return botApi.setupVerification(serverId, body);
  });
});

app.post('/api/server/:id/maintenance', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    return botApi.setMaintenance(serverId, body);
  });
});

app.post('/api/server/:id/purge', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    return botApi.purge(serverId, body);
  });
});

app.post('/api/server/:id/nickname', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    return botApi.setNickname(serverId, body);
  });
});

app.post('/api/server/:id/shop', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    if (body.deleteId) return botApi.deleteShopItem(serverId, body.deleteId);
    if (body.updateId) return botApi.updateShopItem(serverId, body.updateId, body.item || {});
    return botApi.createShopItem(serverId, body.item || body);
  });
});

app.post('/api/server/:id/health', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId) {
    return botApi.runHealth(serverId);
  });
});

app.post('/api/server/:id/integrations', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    if (body.deleteId) return botApi.deleteIntegration(serverId, body.deleteId);
    if (body.testId) return botApi.testIntegration(serverId, body.testId);
    if (body.updateId) return botApi.updateIntegration(serverId, body.updateId, body.integration || {});
    return botApi.createIntegration(serverId, body.integration || body);
  });
});

app.post('/api/server/:id/appeal/:caseId', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  const caseId = String(req.params.caseId || '');
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }
  if (!REMOTE_MODE) {
    return res.status(503).json({ ok: false, error: 'Start the bot API to review appeals.' });
  }

  const action = String((req.body || {}).action || '').toLowerCase();
  if (['approve', 'deny'].indexOf(action) === -1) {
    return res.status(400).json({ ok: false, error: 'Action must be approve or deny.' });
  }

  try {
    const result = await botApi.reviewAppeal(serverId, caseId, action, req.user.id);
    return res.json({ ok: true, appeal: result.appeal });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/server/:id/staff/action', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }
  if (!REMOTE_MODE) {
    return res.status(503).json({ ok: false, error: 'Start the bot API to change staff roles.' });
  }

  const body = req.body || {};
  try {
    const result = await botApi.staffAction(serverId, {
      action: body.action,
      userId: body.userId,
      roleId: body.roleId
    });
    return res.json({ ok: true, result: result.result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/server/:id/joingate', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId, body) {
    const action = String(body.action || '').toLowerCase();
    if (action !== 'release' && action !== 'kick') {
      throw new Error('Join Gate action must be release or kick.');
    }
    return botApi.resolveJoinGate(serverId, action, body.eventId, body.userId);
  });
});

app.post('/api/server/:id/staffops/review', requireAuth, async function (req, res) {
  await relayBotAction(req, res, function (serverId) {
    return botApi.runStaffOpsReview(serverId);
  });
});

app.post('/api/server/:id/ticket/panel', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }

  try {
    const settings = await loadGuildSettings(serverId);
    const body = req.body || {};
    const channelId = cleanId(body.channelId) || settings.ticketPanelChannel;
    const message = await sendDiscordPanel(channelId, ticketPanelPayload(settings));
    return res.json({ ok: true, channelId: String(channelId), messageId: message.id || null });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/server/:id/staff/panel', requireAuth, async function (req, res) {
  const serverId = String(req.params.id);
  if (!canManageGuild(req.user, serverId)) {
    return res.status(403).json({ ok: false, error: 'You cannot manage this server.' });
  }

  try {
    const settings = await loadGuildSettings(serverId);
    const body = req.body || {};
    const channelId = cleanId(body.channelId) || settings.applicationChannel;
    const message = await sendDiscordPanel(channelId, staffPanelPayload(settings));
    return res.json({ ok: true, channelId: String(channelId), messageId: message.id || null });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
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
  if (req.path.indexOf('/api/') === 0) {
    return res.status(404).json({ ok: false, error: 'That dashboard API route does not exist.' });
  }
  return res.status(404).render('error', {
    message: 'Page not found. Use the dashboard to pick a server.'
  });
});

app.use(function (err, req, res, next) {
  console.error('Dashboard error:', err);
  if (req.path.indexOf('/api/') === 0) {
    const status = Number(err.status || err.statusCode) || 500;
    let message = 'The dashboard could not complete that request.';
    if (err.type === 'entity.parse.failed') message = 'The request body was not valid JSON.';
    else if (err.type === 'entity.too.large') message = 'That request is too large to save.';
    else if (status < 500) message = String(err.message || message);
    return res.status(status).json({ ok: false, error: message });
  }
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
