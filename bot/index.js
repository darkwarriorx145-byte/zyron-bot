const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionsBitField,
  ChannelType,
  AuditLogEvent,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const db = require('./src/database/db');
const ZyronEmbedBuilder = require('./src/utils/embedBuilder');
const channelBackup = require('./src/utils/channelBackup');
const security = require('./src/utils/security');
const aiGuard = require('./src/utils/aiGuard');
const webBridge = require('./src/api/webBridge');
const theme = require('./src/utils/theme');
const protection = require('./src/utils/protection');
const appealUtil = require('./src/utils/appeal');
const ticketAssistant = require('./src/utils/ticketAssistant');
const aiSecurity = require('./src/utils/aiSecurityEngine');
const staffTracker = require('./src/utils/staffTracker');
const customCommands = require('./src/utils/customCommands');
const reactionRoles = require('./src/utils/reactionRoles');
const vouch = require('./src/utils/vouch');
const notifications = require('./src/utils/notifications');
const maintenance = require('./src/utils/maintenance');
const verification = require('./src/utils/verification');
const transcript = require('./src/utils/transcript');
const advancedPurge = require('./src/utils/advancedPurge');
const nicknameUtil = require('./src/utils/nickname');
const inviteLogger = require('./src/utils/inviteLogger');

theme.install();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

client.commands = new Collection();
client.giveaways = new Collection();
client.inviteCache = new Collection();

const PREFIX = process.env.PREFIX || config.prefix;
const counters = new Collection();
const minorCooldowns = new Collection();
const spamTracker = new Collection();
const raidChecks = new Set();
const raidPunished = new Collection();

const DANGEROUS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.ModerateMembers,
  PermissionsBitField.Flags.MentionEveryone
];

const LINK_PATTERN = /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i;

const commandsPath = path.join(__dirname, 'src', 'commands');
if (fs.existsSync(commandsPath)) {
  fs.readdirSync(commandsPath).filter(function (file) {
    return file.endsWith('.js');
  }).forEach(function (file) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command && command.name) client.commands.set(command.name, command);
    } catch (err) {
      console.error('Failed to load ' + file + ': ' + err.message);
    }
  });
}

const isMainOwner = protection.isMainOwner;
const isProtectedUser = protection.isProtectedUser;

function isBotOwner(userId) {
  return isMainOwner(userId) || db.isCoOwner(userId);
}

function isTrusted(guild, settings, userId, feature) {
  if (!userId) return true;
  if (userId === client.user.id) return true;
  if (isProtectedUser(userId)) return true;
  if (settings.betrayed && settings.betrayed.indexOf(userId) !== -1) return false;
  if (db.isCoOwner(userId)) return true;
  if (userId === guild.ownerId) return true;
  if (settings.extraOwners && settings.extraOwners.indexOf(userId) !== -1) return true;
  if (db.isWhitelisted(guild.id, userId)) return true;
  if (feature && db.isFeatureWhitelisted(guild.id, feature, userId)) return true;
  return false;
}

function aiRace(promise, ms, fallbackValue) {
  return new Promise(function (resolve) {
    let finished = false;

    const timer = setTimeout(function () {
      if (finished) return;
      finished = true;
      resolve(fallbackValue);
    }, ms);

    promise.then(function (value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    }).catch(function () {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(fallbackValue);
    });
  });
}

function hit(guildId, userId, action, windowMs, limit) {
  const key = guildId + ':' + userId + ':' + action;
  const now = Date.now();
  let entry = counters.get(key);

  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    counters.set(key, entry);
    setTimeout(function () {
      counters.delete(key);
    }, windowMs + 1000);
  }

  entry.count++;
  return entry.count >= limit;
}

function isSpamming(guildId, userId) {
  const key = guildId + ':' + userId;
  const now = Date.now();
  let list = spamTracker.get(key);

  if (!list) {
    list = [];
    spamTracker.set(key, list);
  }

  list.push(now);
  while (list.length > 0 && now - list[0] > 5000) list.shift();
  return list.length >= 6;
}

async function fetchEntry(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type: type, limit: 6 }).catch(function () {
    return null;
  });
  if (!logs) return null;

  return logs.entries.find(function (item) {
    if (targetId && item.targetId !== targetId) return false;
    return Date.now() - item.createdTimestamp < 15000;
  }) || null;
}

async function ensureLogChannel(guild, settings) {
  const saved = settings.logChannel ? guild.channels.cache.get(settings.logChannel) : null;
  if (saved && saved.type === ChannelType.GuildText) return saved;

  const existing = guild.channels.cache.find(function (channel) {
    return channel.name === 'zyron-logs' && channel.type === ChannelType.GuildText;
  });

  if (existing) {
    db.updateGuild(guild.id, { logChannel: existing.id });
    return existing;
  }

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return null;

  const created = await guild.channels.create({
    name: 'zyron-logs',
    type: ChannelType.GuildText,
    topic: 'Zyron security & moderation logs. Powered by ' + config.company,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ],
    reason: 'Zyron: private security log channel.'
  }).catch(function () {
    return null;
  });

  if (created) db.updateGuild(guild.id, { logChannel: created.id });
  return created;
}

async function logAiClearance(guild, settings, action, ai, reason) {
  if (!ai) return;

  const embed = ZyronEmbedBuilder.base({
    color: config.colors.success,
    title: '🧠 AI Guard Cleared an Event',
    description:
      '**Action:** ' + action + '\n' +
      '**Event:** ' + reason + '\n' +
      '**AI Verdict:** ' + String(ai.verdict || 'uncertain').toUpperCase() +
      ' (' + Math.round((ai.confidence || 0) * 100) + '%)\n' +
      '**AI Model:** ' + String(ai.model || 'unknown') + '\n' +
      '**AI Notes:** ' + String(ai.reason || 'No notes') + '\n\n' +
      'No punishment was applied. Review the event if this looks wrong.'
  });

  const channel = await ensureLogChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});
}

async function betray(guild, settings, userId, action, reason) {
  if (isProtectedUser(userId)) return null;

  const member = await guild.members.fetch(userId).catch(function () {
    return null;
  });
  const tag = member ? member.user.tag : userId;

  db.removeWhitelist(guild.id, userId);
  db.removeExtraOwner(guild.id, userId);

  const betrayed = (settings.betrayed || []).slice();
  if (betrayed.indexOf(userId) === -1) betrayed.push(userId);
  db.updateGuild(guild.id, { betrayed: betrayed });

  const fullReason = 'Zyron Anti-Betrayal | ' + action + ' | ' + reason;
  let actionTaken = 'Trust revoked';

  try {
    if (member) {
      if (member.bannable) {
        const banned = await member.ban({ reason: fullReason, deleteMessageSeconds: 0 }).then(function () {
          return true;
        }).catch(function () {
          return false;
        });
        actionTaken = banned ? 'Banned from the server' : 'Ban failed';
      } else if (member.kickable) {
        const kicked = await member.kick(fullReason).then(function () {
          return true;
        }).catch(function () {
          return false;
        });
        actionTaken = kicked ? 'Kicked (ban blocked by role hierarchy)' : 'Kick failed';
      } else {
        actionTaken = userId === guild.ownerId
          ? 'Cannot ban the server owner'
          : 'No action (role hierarchy too high)';
      }
    } else {
      const banned = await guild.bans.create(userId, { reason: fullReason }).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
      actionTaken = banned ? 'Banned from the server' : 'No action (user already left)';
    }
  } catch (err) {
    actionTaken = 'Failed: ' + err.message;
    console.error('Anti-Betrayal error:', err);
  }

  db.addWarning(guild.id, userId, { reason: fullReason, moderator: client.user.id });

  const embed = ZyronEmbedBuilder.antinukeAlert({
    guild: guild,
    action: 'Anti Betrayal',
    executor: { id: userId, tag: tag },
    executorId: userId,
    actionTaken: actionTaken,
    target: action + ' | ' + reason,
    reason: 'A trusted owner or teammate went rogue and was neutralised.',
    severity: 'betrayal'
  });

  const channel = await ensureLogChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});

  await security.alertOwners(client, guild, settings, embed);

  if (settings.aiEnabled !== false && aiGuard.isConfigured()) {
    aiGuard.confirmDestructive({
      settings: settings,
      type: 'anti_betrayal',
      action: action,
      reason: reason,
      target: guild.name,
      guild: guild,
      executor: member ? member.user : { id: userId, tag: tag },
      mass: true,
      recentActions: 3,
      extra: { trustedUser: true, note: 'A trusted teammate performed repeated destructive actions.' }
    }).then(function (ai) {
      if (!ai || !ai.ok) return;
      const analysis = ZyronEmbedBuilder.base({
        color: config.colors.warning,
        title: '🧠 AI Guard — Betrayal Confirmation',
        description:
          '**User:** ' + tag + ' (<@' + userId + '>)\n' +
          '**AI Verdict:** ' + String(ai.verdict || 'uncertain').toUpperCase() +
          ' (' + Math.round((ai.confidence || 0) * 100) + '%)\n' +
          '**AI Model:** ' + String(ai.model || 'unknown') + '\n' +
          '**AI Notes:** ' + String(ai.reason || 'No notes') + '\n\n' +
          'The punishment above was applied by deterministic rules. This is the AI second opinion.'
      });
      if (channel) channel.send({ embeds: [analysis] }).catch(function () {});
    }).catch(function () {});
  }

  if (settings.features.autoLockdown && actionTaken !== 'Banned from the server') {
    await security.startLockdown(client, guild, settings, 'Anti-Betrayal: could not ban ' + tag + ' (' + actionTaken + ')');
  }

  return actionTaken;
}

async function punish(guild, settings, userId, action, reason, severity, options) {
  if (isProtectedUser(userId)) return null;

  const member = await guild.members.fetch(userId).catch(function () {
    return null;
  });
  const tag = member ? member.user.tag : userId;
  const opts = options || {};
  const aiInfo = opts.ai || null;
  const label = action === 'Minor Infraction' ? 'Zyron AutoMod' : 'Zyron Anti-Nuke';
  let fullReason = label + ' | ' + action + ' | ' + reason;

  if (aiInfo && aiInfo.reason) {
    fullReason += ' | AI: ' + String(aiInfo.verdict || 'uncertain').toUpperCase() +
      ' ' + Math.round((aiInfo.confidence || 0) * 100) + '% - ' + aiInfo.reason;
  }

  const level = severity || 'severe';
  const threshold = Math.max(1, parseInt(settings.warningKickThreshold, 10) || 5);
  let strikeCount = 0;

  if (level === 'minor') {
    const previous = db.getWarnings(guild.id, userId).filter(function (warning) {
      return warning.type !== 'antinuke' && warning.type !== 'betrayal';
    });
    strikeCount = previous.length + 1;
  }

  let actionTaken = 'No action possible';

  try {
    if (level === 'minor') {
      if (strikeCount >= threshold) {
        if (member && member.kickable) {
          await member.kick(fullReason);
          actionTaken = 'Kicked after ' + strikeCount + ' warnings (limit ' + threshold + ')';
        } else if (member) {
          actionTaken = 'Warning ' + strikeCount + '/' + threshold + ' (kick blocked by role hierarchy)';
        } else {
          actionTaken = 'Warning ' + strikeCount + '/' + threshold + ' (member already left)';
        }
      } else if (member && member.moderatable) {
        await member.timeout(10 * 60 * 1000, fullReason);
        actionTaken = 'Muted for 10 minutes + warning ' + strikeCount + '/' + threshold;
      } else {
        actionTaken = 'Warning ' + strikeCount + '/' + threshold + ' recorded (mute not possible)';
      }
    } else {
      const requested = opts.action ? String(opts.action) : '';
      const mode = requested === 'ban' || requested === 'kick' || requested === 'timeout'
        ? (requested === 'timeout' ? 'mute' : requested)
        : (level === 'mass' ? 'ban' : (settings.punishment || 'ban'));

      if (member) {
        if (mode === 'ban') {
          if (member.bannable) {
            await member.ban({ reason: fullReason, deleteMessageSeconds: 0 });
            actionTaken = 'Banned from the server';
          } else {
            await member.kick(fullReason).catch(function () {});
            actionTaken = 'Kicked (ban blocked by role hierarchy)';
          }
        } else if (mode === 'kick') {
          if (member.kickable) {
            await member.kick(fullReason);
            actionTaken = 'Kicked from the server';
          } else {
            actionTaken = 'No action (role hierarchy too high)';
          }
        } else if (mode === 'mute') {
          if (member.moderatable) {
            const timeoutMs = opts.timeoutMs ? opts.timeoutMs : (28 * 24 * 60 * 60 * 1000);
            const timeoutLabel = opts.timeoutMs ? Math.round(opts.timeoutMs / 60000) + ' minutes' : '28 days';
            await member.timeout(timeoutMs, fullReason);
            actionTaken = 'Muted for ' + timeoutLabel;
          } else {
            actionTaken = 'No action (role hierarchy too high)';
          }
        } else {
          await member.kick(fullReason).catch(function () {});
          actionTaken = 'Kicked (default punishment)';
        }
      } else {
        const banned = await guild.bans.create(userId, { reason: fullReason }).then(function () {
          return true;
        }).catch(function () {
          return false;
        });
        actionTaken = banned ? 'Banned from the server' : 'No action (user already left)';
      }
    }

  } catch (err) {
    actionTaken = 'Failed: ' + err.message;
    console.error('Anti-Nuke punishment error:', err);
  }

  if (typeof db.addWarning === 'function') {
    db.addWarning(guild.id, userId, {
      reason: fullReason,
      moderator: client.user.id,
      type: level === 'minor' ? 'minor' : 'antinuke',
      source: action
    });
  }

  if (level === 'minor') {
    if (actionTaken.indexOf('Kicked after') === 0) {
      await appealUtil.createAppealCase(guild, settings, userId, {
        action: 'kick',
        actionTaken: 'Kicked from the server',
        reason: reason,
        warnings: strikeCount,
        type: 'minor',
        channelId: null
      }).catch(function (err) {
        console.error('Appeal case error:', err.message);
      });
    } else {
      const warningUser = await guild.client.users.fetch(userId).catch(function () {
        return null;
      });
      if (warningUser) {
        notifications.dmWarning(warningUser, {
          reason: reason,
          count: strikeCount,
          threshold: threshold,
          guild: guild
        }).catch(function () {});
      }
    }
  }

  const embed = ZyronEmbedBuilder.antinukeAlert({
    guild: guild,
    action: action,
    executor: { id: userId, tag: tag },
    executorId: userId,
    actionTaken: actionTaken,
    target: reason,
    reason: reason,
    severity: level,
    ai: aiInfo
  });

  const channel = await ensureLogChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});

  if (level !== 'minor') {
    const owner = await guild.members.fetch(guild.ownerId).catch(function () {
      return null;
    });
    if (owner) owner.send({ embeds: [embed] }).catch(function () {});
  }

  const punishFailed =
    actionTaken.indexOf('No action') === 0 ||
    actionTaken.indexOf('Failed') === 0 ||
    actionTaken.indexOf('Kick failed') === 0 ||
    actionTaken.indexOf('Ban failed') === 0 ||
    actionTaken.indexOf('Kicked (ban blocked') === 0 ||
    actionTaken.indexOf('Warning recorded') === 0;

  if (level !== 'minor' && punishFailed && settings.features && settings.features.autoLockdown) {
    await security.startLockdown(
      client,
      guild,
      settings,
      'Unable to punish ' + tag + ' automatically (' + actionTaken + ')'
    );
  }

  return actionTaken;
}

async function aiGuardHandler(guild, settings, entry, actionType, reason, extraContext, revertFn) {
  if (!settings.antiNukeEnabled) return false;

  const executor = entry.executor;
  if (!executor) return false;
  if (executor.id === client.user.id) return false;
  if (isProtectedUser(executor.id)) return false;

  let decision = null;

  if (executor.bot) {
    decision = await aiSecurity.evaluateBotAction(guild, settings, entry, actionType);
  } else if (aiSecurity.isTrustedExecutor(guild, settings, executor.id)) {
    const massCheck = await aiSecurity.checkMassAction(guild, executor.id, actionType);
    if (massCheck.isMass) {
      decision = {
        action: 'ban',
        confidence: 0.95,
        reason: 'Trusted user mass ' + actionType + ' (' + massCheck.count + ' in 10s)',
        severity: 'critical',
        evidence: ['Trusted user', 'Mass action detected', 'Count: ' + massCheck.count]
      };
    }
  }

  if (!decision) {
    decision = await aiSecurity.evaluateAuditAction(guild, settings, entry, actionType, extraContext);
  }

  if (!decision || decision.action === 'allow') {
    return false;
  }

  if (revertFn) {
    await revertFn(entry).catch(function () {});
  }

  const result = await aiSecurity.executeDecision(
    guild,
    settings,
    decision,
    executor.id,
    extraContext.targetId || null,
    reason,
    entry
  );

  if (result.executed) {
    staffTracker.logStaffAction(guild.id, 'ai-engine', actionType, {
      executor: executor.id,
      action: decision.action,
      confidence: decision.confidence,
      severity: decision.severity
    });
  }

  return result.executed;
}

function runAiGuard(guild, settings, options) {
  aiGuardHandler(guild, settings, options.entry, options.action, options.reason, options.context || {}, options.revert)
    .catch(function (err) {
      console.error('AI Guard error (' + options.action + '):', err);
    });
}

async function handleMinorViolation(guild, settings, authorId, violation, ai) {
  await punish(guild, settings, authorId, 'Minor Infraction', violation, 'minor', { ai: ai || null });
  return true;
}

const ticketAiCooldowns = new Map();

async function handleTicketMessage(message, settings) {
  if (!message.channel || !message.channel.isTextBased()) return;
  const record = db.getTicketByChannel(message.guild.id, message.channel.id);
  if (!record || record.status !== 'open') return;

  const staff = ticketAssistant.isTicketStaff(message.member, settings);

  if (staff) {
    if (record.aiPaused) return;
    db.updateTicket(message.guild.id, record.id, {
      aiPaused: true,
      handledBy: message.author.id,
      handledAt: Date.now()
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:ai:resume')
        .setLabel('Continue with AI')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({
      embeds: [ticketAssistant.handledEmbed(message.author)],
      components: [row]
    }).catch(function () {});
    return;
  }

  if (message.author.id !== record.userId) return;
  if (record.aiPaused) return;
  if (settings.ticketAiEnabled === false || settings.aiEnabled === false) return;
  if (!message.content || message.content.trim().length === 0) return;

  const cooldownKey = message.guild.id + ':' + message.channel.id;
  if (ticketAiCooldowns.has(cooldownKey)) return;
  ticketAiCooldowns.set(cooldownKey, true);
  setTimeout(function () {
    ticketAiCooldowns.delete(cooldownKey);
  }, 5000);

  const fetched = await message.channel.messages.fetch({ limit: 8 }).catch(function () {
    return null;
  });
  const history = [];
  if (fetched) {
    fetched.forEach(function (entry) {
      if (entry.id === message.id) return;
      history.push({
        author: entry.author.bot ? config.botName + ' AI' : entry.author.username,
        content: String(entry.content || '').slice(0, 500)
      });
    });
    history.reverse();
  }

  const reply = await ticketAssistant.replyToMessage({
    settings: settings,
    type: record.type,
    reason: record.reason,
    user: message.author,
    message: message.content,
    history: history
  });

  if (reply) {
    await message.channel.send(String(reply).slice(0, 2000)).catch(function () {});
    db.updateTicket(message.guild.id, record.id, {
      aiReplies: (record.aiReplies || 0) + 1,
      lastAiAt: Date.now()
    });
  }
}

let readyHandled = false;

function onReady() {
  if (readyHandled) return;
  readyHandled = true;

  console.log('Zyron is online as ' + client.user.tag);
  console.log('Loaded ' + client.commands.size + ' commands.');
  webBridge.start(client);

  client.guilds.cache.forEach(function (guild) {
    db.getGuild(guild.id);
    channelBackup.backupGuild(guild);
    cacheInvites(guild);
  });

  client.user.setActivity(PREFIX + 'help | Protecting ' + client.guilds.cache.size + ' servers', { type: 3 });
}

client.once('clientReady', onReady);

client.on('guildCreate', async function (guild) {
  const settings = db.getGuild(guild.id);
  channelBackup.backupGuild(guild);
  cacheInvites(guild);
  const logChannel = await ensureLogChannel(guild, settings);
  console.log('Joined guild: ' + guild.name + ' (' + guild.id + ')');

  if (settings.features.autoMod) {
    security.provisionAutoMod(guild, db.getGuild(guild.id)).catch(function (err) {
      console.error('AutoMod provisioning failed:', err.message);
    });
  }

  if (logChannel) {
    logChannel.send({
      embeds: [
        ZyronEmbedBuilder.base({
          title: '🛡️ Zyron Security Online',
          description:
            'Every Anti-Nuke alert for **' + guild.name + '** will be logged here.\n\n' +
            '**Prefix:** ' + (settings.prefix || PREFIX) + '\n' +
            '**Status:** 🟢 All 24 protections armed\n\n' +
            'Run ' + (settings.prefix || PREFIX) + 'antinuke settings to view the live matrix.'
        })
      ]
    }).catch(function () {});
  }

  if (guild.systemChannel) {
    guild.systemChannel.send({
      embeds: [
        ZyronEmbedBuilder.base({
          title: '🛡️ Thanks for adding Zyron',
          description:
            'I am now protecting **' + guild.name + '** with Anti-Nuke, AutoMod, anti-raid and auto lockdown.\n\n' +
            '**Setup**\n' +
            '1. Move my role above every other role.\n' +
            '2. Run ' + PREFIX + 'antinuke settings\n' +
            '3. Whitelist staff with ' + PREFIX + 'antinuke whitelist @user\n' +
            '4. Run ' + PREFIX + 'automod setup for native AutoMod\n\n' +
            (logChannel ? 'Security logs: ' + logChannel : 'Logs channel could not be created.')
        })
      ]
    }).catch(function () {});
  }

  client.user.setActivity(PREFIX + 'help | Protecting ' + client.guilds.cache.size + ' servers', { type: 3 });
});

client.on('guildDelete', function (guild) {
  console.log('Left guild: ' + guild.name + ' (' + guild.id + ')');
  client.user.setActivity(PREFIX + 'help | Protecting ' + client.guilds.cache.size + ' servers', { type: 3 });
});

client.on('messageCreate', async function (message) {
  if (!message.guild || message.author.bot) return;

  db.addMessage(message.guild.id, message.author.id);

  const settings = db.getGuild(message.guild.id);
  const prefix = settings.prefix || PREFIX;
  const isCommandMessage = message.content.startsWith(prefix);
  const protectedAuthor = isProtectedUser(message.author.id);

  const activeTicket = db.getTicketByChannel(message.guild.id, message.channel.id);

  if (maintenance.isMaintenanceMode(message.guild.id) && !protectedAuthor) {
    const allowedRoles = settings.maintenanceAllowedRoles || [];
    const hasAllowedRole = message.member && message.member.roles.cache.some(function (role) {
      return allowedRoles.indexOf(role.id) !== -1;
    });
    const canManage = message.member && message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!hasAllowedRole && !canManage && !isCommandMessage) {
      await message.delete().catch(function () {});
      return;
    }
  }

  if (!isCommandMessage && !protectedAuthor && !activeTicket) {
    const aiDecision = await aiSecurity.evaluateMessage(message.guild, settings, message);
    if (aiDecision && aiDecision.action !== 'allow') {
      await message.delete().catch(function () {});
      await aiSecurity.executeDecision(
        message.guild,
        settings,
        aiDecision,
        message.author.id,
        null,
        'Message moderation: ' + aiDecision.reason,
        null
      );
      return;
    }

    const messageGuards = settings.features.antiAbuse ||
      settings.features.antiSpam ||
      settings.features.antiLink ||
      settings.features.antiEveryone;

    if (messageGuards) {
      const pingedEveryone = message.mentions.everyone === true ||
        message.content.indexOf('@everyone') !== -1 ||
        message.content.indexOf('@here') !== -1;

      const profanity = settings.features.antiAbuse ? security.findProfanity(message.content) : null;

      let violation = null;
      let violationFeature = null;

      if (profanity) {
        violation = 'Used prohibited language: ' + profanity;
        violationFeature = 'antiAbuse';
      } else if (pingedEveryone && settings.features.antiEveryone) {
        violation = 'Used @everyone / @here';
        violationFeature = 'antiEveryone';
      } else if (settings.features.antiEveryone && message.mentions.users.size >= 6) {
        violation = 'Mass mentioned ' + message.mentions.users.size + ' users';
        violationFeature = 'antiEveryone';
      } else if (settings.features.antiSpam && isSpamming(message.guild.id, message.author.id)) {
        violation = 'Spamming messages';
        violationFeature = 'antiSpam';
      } else if (settings.features.antiLink && LINK_PATTERN.test(message.content)) {
        violation = 'Posted an unauthorized link';
        violationFeature = 'antiLink';
      }

      if (violation && violationFeature && db.isFeatureWhitelisted(message.guild.id, violationFeature, message.author.id)) {
        violation = null;
        violationFeature = null;
      }

      if (violation) {
        const key = message.guild.id + ':' + message.author.id;
        const onCooldown = minorCooldowns.has(key);

        if (!onCooldown) {
          minorCooldowns.set(key, true);
          setTimeout(function () { minorCooldowns.delete(key); }, 20000);

          await message.delete().catch(function () {});
          await handleMinorViolation(message.guild, settings, message.author.id, violation, null);
        }
      }
    }
  }

  if (!isCommandMessage) {
    await handleTicketMessage(message, settings).catch(function (err) {
      console.error('Ticket assistant error:', err.message);
    });
  }

  if (!message.content.startsWith(prefix)) return;

  const raw = message.content.slice(prefix.length).trim();
  if (!raw) return;

  const args = raw.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName) || client.commands.find(function (cmd) {
    return cmd.aliases && cmd.aliases.indexOf(commandName) !== -1;
  });

  if (!command) {
    if (commandName === 'vouch' || commandName === 'feedback') {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Vouch', 'Mention the user you want to vouch for. Example: `.' + commandName + ' @user`')]
        }).catch(function () {});
      }
      return message.reply({
        embeds: [ZyronEmbedBuilder.info('Vouch Started', 'Click the button below to open the vouch form for ' + target.username + '.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('vouch:open:' + target.id)
            .setLabel('Open Vouch Form')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🤝')
        )]
      }).catch(function () {});
    }

    const custom = customCommands.getCustomCommand(message.guild.id, commandName);
    if (!custom) return;
    if (!customCommands.canUseCommand(message.member, custom, message.channel.id)) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Custom Command', 'You do not have access to this command.')]
      }).catch(function () {});
    }
    return customCommands.executeCustomCommand(message, custom).catch(function (err) {
      console.error('Custom command error:', err.message);
    });
  }

  if (command.permissions && command.permissions.length > 0) {
    if (!message.member.permissions.has(command.permissions)) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Permission Denied', 'You lack the permissions required for this command.')]
      }).catch(function () {});
    }
  }

  const isExtraOwner = settings.extraOwners.indexOf(message.author.id) !== -1;

  if (command.mainOwnerOnly && !isMainOwner(message.author.id)) {
    return message.reply({
      embeds: [ZyronEmbedBuilder.error('Main Owner Only', 'Only the main bot owner from the .env file can run this command.')]
    }).catch(function () {});
  }

  if (command.ownerOnly && !isBotOwner(message.author.id) && !isExtraOwner) {
    return message.reply({
      embeds: [ZyronEmbedBuilder.error('Owner Only Command', 'Only the bot owner, a co-owner or an extra owner can run this command.')]
    }).catch(function () {});
  }

  try {
    await command.execute(client, message, args, prefix);
  } catch (err) {
    console.error('Command error (' + commandName + '):', err);
    message.reply({
      embeds: [ZyronEmbedBuilder.error('Command Error', 'There was an error while running that command.')]
    }).catch(function () {});
  }
});

client.on('autoModerationActionExecution', async function (execution) {
  const guild = execution.guild;
  if (!guild) return;

  const settings = db.getGuild(guild.id);
  if (!settings.features.autoMod) return;

  const userId = execution.userId;
  if (!userId) return;
  if (isProtectedUser(userId)) return;

  const member = await guild.members.fetch(userId).catch(function () {
    return null;
  });
  const tag = member ? member.user.tag : userId;
  const trigger = String(execution.ruleTriggerType || 'AutoMod');
  const keyword = execution.matchedKeyword ? ' | Keyword: ' + execution.matchedKeyword : '';

  const embed = ZyronEmbedBuilder.base({
    color: config.colors.warning,
    title: '🤖 AutoMod Action Executed',
    description:
      '**User:** ' + tag + ' (<@' + userId + '>)\n' +
      '**Channel:** <#' + execution.channelId + '>\n' +
      '**Trigger:** ' + trigger + keyword + '\n' +
      '**Rule:** ' + String(execution.ruleId || 'Unknown')
  });

  const channel = await ensureLogChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});

  let autoFeature = 'antiAbuse';
  if (execution.ruleTriggerType === 3) autoFeature = 'antiSpam';
  else if (execution.ruleTriggerType === 5) autoFeature = 'antiEveryone';
  if (db.isFeatureWhitelisted(guild.id, autoFeature, userId)) return;

  const cooldownKey = 'automod:' + guild.id + ':' + userId;
  if (minorCooldowns.has(cooldownKey)) return;

  const strikes = hit(guild.id, userId, 'automod', 10 * 60 * 1000, 3);
  if (!strikes) return;

  minorCooldowns.set(cooldownKey, true);
  setTimeout(function () {
    minorCooldowns.delete(cooldownKey);
  }, 5 * 60 * 1000);

  await punish(guild, settings, userId, 'AutoMod Repeat Offender', 'Triggered AutoMod 3 times' + keyword, 'minor');
});

client.on('guildBanAdd', function (ban) {
  const guild = ban.guild;
  const settings = db.getGuild(guild.id);

  fetchEntry(guild, AuditLogEvent.MemberBanAdd, ban.user.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Ban',
        reason: 'Unauthorized ban of ' + ban.user.tag,
        context: { targetId: ban.user.id },
        revert: function () {
          return guild.bans.remove(ban.user.id, 'Zyron Anti-Nuke: reverting unauthorized ban.');
        }
      });
    }
  });
});

client.on('guildMemberRemove', async function (member) {
  const guild = member.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled) return;

  if (settings.features.antiKick) {
    const kick = await fetchEntry(guild, AuditLogEvent.MemberKick, member.id);
    if (kick && kick.executor && !isProtectedUser(kick.executor.id) && !db.isFeatureWhitelisted(guild.id, 'antiKick', kick.executor.id)) {
      if (isTrusted(guild, settings, kick.executor.id, 'antiKick')) {
        if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', kick.executor.id)) {
          const rogue = hit(guild.id, kick.executor.id, 'betray:kick', 15000, 1);
          if (rogue) {
            await betray(guild, settings, kick.executor.id, 'Anti Betrayal (Kick)', 'Mass kicked members');
            return;
          }
        }
      } else {
        const mass = hit(guild.id, kick.executor.id, 'kick', 10000, 3);
        await punish(
          guild,
          settings,
          kick.executor.id,
          'Anti Kick',
          'Unauthorized kick of ' + member.user.tag,
          mass ? 'mass' : 'severe'
        );
        return;
      }
    }
  }

  if (settings.features.antiPrune) {
    const prune = await fetchEntry(guild, AuditLogEvent.MemberPrune, member.id);
    if (prune && prune.executor && !isProtectedUser(prune.executor.id) && !db.isFeatureWhitelisted(guild.id, 'antiPrune', prune.executor.id)) {
      if (isTrusted(guild, settings, prune.executor.id, 'antiPrune')) {
        if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', prune.executor.id)) {
          const rogue = hit(guild.id, prune.executor.id, 'betray:prune', 15000, 1);
          if (rogue) {
            await betray(guild, settings, prune.executor.id, 'Anti Betrayal (Prune)', 'Mass pruned members');
          }
        }
      } else {
        await punish(guild, settings, prune.executor.id, 'Anti Prune', 'Unauthorized member prune', 'mass');
      }
    }
  }
});

client.on('guildMemberAdd', function (member) {
  if (!member.user.bot) return;
  const guild = member.guild;
  const settings = db.getGuild(guild.id);

  fetchEntry(guild, AuditLogEvent.BotAdd, member.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Bot Add',
        reason: 'Added unauthorized bot ' + member.user.tag,
        context: { targetId: member.id },
        revert: function () {
          return member.kick('Zyron Anti-Nuke: unauthorized bot.');
        }
      });
    }
  });
});

client.on('channelCreate', function (channel) {
  if (!channel.guild) return;
  const guild = channel.guild;
  const settings = db.getGuild(guild.id);

  channelBackup.saveChannel(guild.id, channel);

  fetchEntry(guild, AuditLogEvent.ChannelCreate, channel.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Channel Create',
        reason: 'Created channel #' + channel.name,
        context: { targetId: channel.id },
        revert: function () {
          return channel.delete('Zyron Anti-Nuke: unauthorized channel creation.');
        }
      });
    }
  });
});

client.on('channelDelete', async function (channel) {
  if (!channel.guild) return;
  const guild = channel.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled) return;

  const entry = await fetchEntry(guild, AuditLogEvent.ChannelDelete, channel.id);
  const executorId = entry && entry.executor ? entry.executor.id : null;

  if (executorId === client.user.id) {
    db.removeChannelBackup(guild.id, channel.id);
    return;
  }

  if (!executorId && settings.features.antiChannelRecovery) {
    const backup = db.getChannelBackup(guild.id, channel.id);
    if (backup) {
      const restored = await channelBackup.restore(guild, Object.assign({}, backup, { oldId: channel.id }));
      if (restored) console.log('Restored deleted channel ' + channel.name + ' in ' + guild.name);
    }
  }

  if (entry) {
    runAiGuard(guild, settings, {
      entry: entry,
      action: 'Anti Channel Delete',
      reason: 'Deleted channel #' + channel.name,
      context: { targetId: channel.id }
    });
  }
});

client.on('channelUpdate', function (oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const guild = newChannel.guild;
  const settings = db.getGuild(guild.id);

  channelBackup.saveChannel(guild.id, newChannel);

  fetchEntry(guild, AuditLogEvent.ChannelUpdate, newChannel.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Channel Update',
        reason: 'Updated channel #' + newChannel.name,
        context: { targetId: newChannel.id }
      });
    }
  });
});

client.on('roleCreate', function (role) {
  const guild = role.guild;
  const settings = db.getGuild(guild.id);

  fetchEntry(guild, AuditLogEvent.RoleCreate, role.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Role Create',
        reason: 'Created role ' + role.name,
        context: { targetId: role.id },
        revert: function () {
          return role.delete('Zyron Anti-Nuke: unauthorized role creation.');
        }
      });
    }
  });
});

client.on('roleDelete', function (role) {
  const guild = role.guild;
  const settings = db.getGuild(guild.id);

  fetchEntry(guild, AuditLogEvent.RoleDelete, role.id).then(function (entry) {
    if (entry) {
      runAiGuard(guild, settings, {
        entry: entry,
        action: 'Anti Role Delete',
        reason: 'Deleted role ' + role.name,
        context: { targetId: role.id }
      });
    }
  });
});

client.on('roleUpdate', async function (oldRole, newRole) {
  const guild = newRole.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled) return;

  const entry = await fetchEntry(guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (isProtectedUser(entry.executor.id)) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiRoleUpdate', entry.executor.id)) return;

  const danger = DANGEROUS.some(function (perm) {
    return newRole.permissions.has(perm) && !oldRole.permissions.has(perm);
  });

  if (danger) {
    await newRole.setPermissions(oldRole.permissions, 'Zyron Anti-Nuke: reverting dangerous permissions.').catch(function () {});
    runAiGuard(guild, settings, {
      entry: entry,
      action: 'Anti Dangerous Permission Update',
      reason: 'Granted dangerous permissions to role ' + newRole.name,
      context: { targetId: newRole.id, dangerous: true },
      revert: function () {
        return newRole.setPermissions(oldRole.permissions, 'Zyron AI Security: revert dangerous perms');
      }
    });
    return;
  }

  runAiGuard(guild, settings, {
    entry: entry,
    action: 'Anti Role Update',
    reason: 'Updated role ' + newRole.name,
    context: { targetId: newRole.id }
  });
});

client.on('webhookUpdate', async function (channel) {
  if (!channel.guild) return;
  const guild = channel.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiWebhook) return;

  let entry = await fetchEntry(guild, AuditLogEvent.WebhookCreate, null);
  if (!entry) entry = await fetchEntry(guild, AuditLogEvent.WebhookUpdate, null);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (isProtectedUser(entry.executor.id)) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiWebhook', entry.executor.id)) return;

  const hooks = await channel.fetchWebhooks().catch(function () {
    return null;
  });

  if (hooks && entry.action === AuditLogEvent.WebhookCreate) {
    hooks.forEach(function (hook) {
      if (hook.ownerId !== client.user.id) {
        hook.delete('Zyron AI Security: unauthorized webhook.').catch(function () {});
      }
    });
  }

  runAiGuard(guild, settings, {
    entry: entry,
    action: 'Anti Webhook',
    reason: 'Created or edited a webhook in #' + channel.name,
    context: { targetId: channel.id }
  });
});

client.on('guildUpdate', async function (oldGuild, newGuild) {
  const guild = newGuild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiGuildUpdate) return;

  const entry = await fetchEntry(guild, AuditLogEvent.GuildUpdate, guild.id);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (isProtectedUser(entry.executor.id)) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiGuildUpdate', entry.executor.id)) return;

  const criticalChange = oldGuild.name !== newGuild.name || oldGuild.iconURL() !== newGuild.iconURL() || oldGuild.verificationLevel !== newGuild.verificationLevel;

  if (criticalChange) {
    if (oldGuild.name !== newGuild.name) {
      await newGuild.setName(oldGuild.name, 'Zyron AI Security: reverting guild name').catch(function () {});
    }
    if (oldGuild.iconURL() !== newGuild.iconURL()) {
      await newGuild.setIcon(oldGuild.iconURL(), 'Zyron AI Security: reverting guild icon').catch(function () {});
    }
    runAiGuard(guild, settings, {
      entry: entry,
      action: 'Anti Guild Update',
      reason: 'Critical server settings changed',
      context: { targetId: guild.id, critical: true },
      revert: function () {
        const p = [];
        if (oldGuild.name !== newGuild.name) p.push(newGuild.setName(oldGuild.name, 'Zyron AI Security: revert name'));
        if (oldGuild.iconURL() !== newGuild.iconURL()) p.push(newGuild.setIcon(oldGuild.iconURL(), 'Zyron AI Security: revert icon'));
        return Promise.all(p);
      }
    });
  } else {
    runAiGuard(guild, settings, {
      entry: entry,
      action: 'Anti Guild Update',
      reason: 'Server settings changed',
      context: { targetId: guild.id }
    });
  }
});

client.on('guildIntegrationsUpdate', async function (guild) {
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiIntegration) return;

  let entry = await fetchEntry(guild, AuditLogEvent.IntegrationCreate, null);
  if (!entry) entry = await fetchEntry(guild, AuditLogEvent.IntegrationUpdate, null);
  if (!entry) entry = await fetchEntry(guild, AuditLogEvent.IntegrationDelete, null);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (isProtectedUser(entry.executor.id)) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiIntegration', entry.executor.id)) return;

  runAiGuard(guild, settings, {
    entry: entry,
    action: 'Anti Integration',
    reason: 'Added, edited or removed an integration',
    context: { targetId: guild.id }
  });
});

client.on('guildMemberUpdate', async function (oldMember, newMember) {
  const guild = newMember.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiMemberUpdate) return;

  const addedRole = newMember.roles.cache.find(function (role) {
    if (oldMember.roles.cache.has(role.id)) return false;
    return DANGEROUS.some(function (perm) {
      return role.permissions.has(perm);
    });
  });

  if (!addedRole) return;

  const entry = await fetchEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (isProtectedUser(entry.executor.id)) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiMemberUpdate', entry.executor.id)) return;

  await newMember.roles.set(oldMember.roles.cache.map(function (role) {
    return role.id;
  }), 'Zyron AI Security: reverting dangerous role grant').catch(function () {});

  runAiGuard(guild, settings, {
    entry: entry,
    action: 'Anti Member Update',
    reason: 'Gave ' + newMember.user.tag + ' the dangerous role ' + addedRole.name,
    context: { targetId: newMember.id, roleId: addedRole.id, dangerous: true },
    revert: function () {
      return newMember.roles.set(oldMember.roles.cache.map(function (role) { return role.id; }), 'Zyron AI Security: revert role grant');
    }
  });
});

function raidKey(guildId, userId) {
  return guildId + ':' + userId;
}

async function punishRaidMember(guild, settings, member, ai) {
  if (isProtectedUser(member.id)) return null;

  const key = raidKey(guild.id, member.id);
  if (raidPunished.has(key)) return null;
  raidPunished.set(key, true);
  setTimeout(function () {
    raidPunished.delete(key);
  }, 10 * 60 * 1000);

  const mode = settings.raidPunishment === 'ban' ? 'ban' : 'kick';
  const aiNote = ai && ai.reason ? ' AI: ' + ai.reason : '';
  const reason = 'Zyron Anti-Raid: raid detected, automatic ' + mode + '.' + aiNote;
  let actionTaken = 'No action (role hierarchy too high)';

  try {
    if (mode === 'ban' && member.bannable) {
      const banned = await member.ban({ reason: reason }).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
      actionTaken = banned ? 'Banned from the server' : 'Ban failed';
    } else if (member.kickable) {
      const kicked = await member.kick(reason).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
      actionTaken = kicked ? 'Kicked from the server' : 'Kick failed';
    }
  } catch (err) {
    actionTaken = 'Failed: ' + err.message;
  }

  db.addWarning(guild.id, member.id, { reason: reason, moderator: client.user.id });
  return actionTaken;
}

async function punishRaidJoiners(guild, settings, recent, ai) {
  const mode = settings.raidPunishment === 'ban' ? 'ban' : 'kick';
  const lines = [];
  const list = recent.slice(-12);

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || !item.id || item.isBot) continue;
    if (isTrusted(guild, settings, item.id, 'antiRaid')) continue;

    const member = await guild.members.fetch(item.id).catch(function () {
      return null;
    });
    if (!member) continue;

    const result = await punishRaidMember(guild, settings, member, ai);
    if (result) lines.push('<@' + item.id + '> - ' + result);
  }

  if (lines.length === 0) return;

  const embed = ZyronEmbedBuilder.base({
    color: config.colors.danger,
    title: '🚨 Anti-Raid Sweep',
    description:
      '**Raid Action:** ' + mode.toUpperCase() + '\n' +
      '**Accounts Handled:** ' + lines.length + '\n' +
      (ai && ai.ok
        ? '**AI Verdict:** ' + String(ai.verdict).toUpperCase() +
          ' (' + Math.round((ai.confidence || 0) * 100) + '%)\n' +
          '**AI Notes:** ' + String(ai.reason || 'No notes') + '\n'
        : '') +
      '\n' + lines.join('\n')
  });

  const channel = await ensureLogChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});
}

async function handleRaidDetection(guild, settings, joins) {
  if (raidChecks.has(guild.id)) return;
  raidChecks.add(guild.id);

  try {
    const recent = security.getRecentJoins(guild.id, 10000);
    const young = recent.filter(function (item) {
      return item.accountAgeDays < 7;
    }).length;
    const suspicious = recent.length > 0 && young >= Math.ceil(recent.length * 0.6);

    let ai = null;
    let confirmed = suspicious;

    if (suspicious) {
      ai = {
        ok: true,
        verdict: 'raid',
        action: settings.raidPunishment === 'ban' ? 'ban' : 'kick',
        severity: 'high',
        confidence: 0.9,
        reason: 'Heuristic: most recent joins are accounts younger than 7 days.',
        model: 'deterministic-rules',
        latency: 0
      };

      if (settings.aiEnabled !== false && aiGuard.isConfigured()) {
        aiGuard.confirmRaid({
          settings: settings,
          guild: guild,
          joins: joins,
          recent: recent,
          windowSeconds: 10
        }).then(function (result) {
          if (!result || !result.ok) return;
          const channel = security.getLockAlertChannel(guild, settings);
          if (!channel) return;
          const embed = ZyronEmbedBuilder.base({
            color: config.colors.warning,
            title: '🧠 AI Guard — Raid Confirmation',
            description:
              '**AI Verdict:** ' + String(result.verdict || 'uncertain').toUpperCase() +
              ' (' + Math.round((result.confidence || 0) * 100) + '%)\n' +
              '**AI Model:** ' + String(result.model || 'unknown') + '\n' +
              '**AI Notes:** ' + String(result.reason || 'No notes') + '\n\n' +
              'The raid response was already triggered by the account-age heuristic.'
          });
          channel.send({ embeds: [embed] }).catch(function () {});
        }).catch(function () {});
      }
    } else if (settings.aiEnabled !== false && aiGuard.isConfigured()) {
      ai = await aiRace(
        aiGuard.confirmRaid({
          settings: settings,
          guild: guild,
          joins: joins,
          recent: recent,
          windowSeconds: 10
        }),
        6000,
        {
          ok: false,
          verdict: 'uncertain',
          action: 'none',
          confidence: 0,
          reason: 'AI timed out, fail-safe lockdown used.',
          model: 'timeout',
          latency: 6000
        }
      );

      if (ai.ok && ai.verdict === 'legit' && ai.confidence >= aiGuard.getConfidence(settings)) {
        await logAiClearance(guild, settings, 'Anti-Raid', ai, 'Join spike assessed as organic growth.');
        return;
      }

      confirmed = true;
    } else {
      confirmed = true;
    }

    if (!confirmed) return;

    security.startRaidMode(guild.id, 5 * 60 * 1000);

    await security.startLockdown(
      client,
      guild,
      settings,
      'Raid detected: ' + joins + ' joins in 10 seconds' +
        (ai && ai.ok ? ' | AI: ' + ai.verdict : '')
    ).catch(function () {});

    await punishRaidJoiners(guild, settings, security.getRecentJoins(guild.id, 30000), ai);
  } finally {
    raidChecks.delete(guild.id);
  }
}

client.on('guildMemberAdd', async function (member) {
  const guild = member.guild;
  const settings = db.getGuild(guild.id);

  security.trackMemberJoin(guild.id, member);

  if (settings.features.antiRaid) {
    const joins = security.trackJoin(guild.id);

    if (joins >= 8 && !security.isRaidActive(guild.id)) {
      await handleRaidDetection(guild, settings, joins);
    }

    if (security.isRaidActive(guild.id) && !isTrusted(guild, settings, member.id, 'antiRaid')) {
      const actionTaken = await punishRaidMember(guild, settings, member, null);

      if (actionTaken) {
        const embed = ZyronEmbedBuilder.base({
          color: config.colors.danger,
          title: '🚨 Anti-Raid Action',
          description:
            '**User:** ' + member.user.tag + ' (<@' + member.id + '>)\n' +
            '**Action:** ' + actionTaken + '\n' +
            '**Raid Mode:** ' + (settings.raidPunishment === 'ban' ? 'BAN' : 'KICK') + '\n' +
            '**Reason:** Mass join raid detected.'
        });

        const channel = await ensureLogChannel(guild, settings);
        if (channel) channel.send({ embeds: [embed] }).catch(function () {});

        if (actionTaken.indexOf('Banned') === 0 || actionTaken.indexOf('Kicked') === 0) {
          return;
        }
      }
    }
  }

  if (member.user.bot) {
    if (settings.autoRoleBotId) {
      const botRole = guild.roles.cache.get(settings.autoRoleBotId);
      if (botRole && botRole.editable) {
        member.roles.add(botRole, 'Zyron AutoRole: bot role').catch(function () {});
      }
    }
    return;
  }

  if (settings.verificationEnabled) {
    const verifyRole = settings.verificationRole ? guild.roles.cache.get(settings.verificationRole) : null;
    const alreadyVerified = verifyRole && member.roles.cache.has(verifyRole.id);

    if (!alreadyVerified) {
      if (settings.verificationMode !== 'channel') {
        notifications.dmVerification(
          member,
          settings.verificationRules || 'Please accept the server rules in the verification channel.',
          guild
        ).catch(function () {});
      }
    }
  }

  if (settings.autoRoleId && !settings.verificationEnabled) {
    const role = guild.roles.cache.get(settings.autoRoleId);
    if (role && role.editable) {
      member.roles.add(role, 'Zyron AutoRole: join role').catch(function () {});
    }
  }
});

client.on('guildMemberUpdate', function (oldMember, newMember) {
  if (newMember.user.bot) return;

  const settings = db.getGuild(newMember.guild.id);
  if (!settings.boosterRoleId) return;

  const role = newMember.guild.roles.cache.get(settings.boosterRoleId);
  if (!role || !role.editable) return;

  if (!oldMember.premiumSince && newMember.premiumSince) {
    newMember.roles.add(role, 'Zyron AutoRole: server booster').catch(function () {});
  }

  if (oldMember.premiumSince && !newMember.premiumSince) {
    newMember.roles.remove(role, 'Zyron AutoRole: boost ended').catch(function () {});
  }
});

async function cacheInvites(guild) {
  const invites = await guild.invites.fetch().catch(function () {
    return null;
  });

  if (!invites) return;

  const map = new Map();
  invites.forEach(function (invite) {
    map.set(invite.code, invite.uses || 0);
  });

  client.inviteCache.set(guild.id, map);
}

async function trackInviteJoin(member) {
  if (member.user.bot) return;

  const guild = member.guild;
  const settings = db.getGuild(guild.id);
  const previous = db.getInviteRecord(guild.id, member.id);

  const cached = client.inviteCache.get(guild.id) || new Map();
  const invites = await guild.invites.fetch().catch(function () {
    return null;
  });

  let used = null;

  if (invites) {
    invites.forEach(function (invite) {
      const before = cached.get(invite.code) || 0;
      if ((invite.uses || 0) > before) used = invite;
    });

    const map = new Map();
    invites.forEach(function (invite) {
      map.set(invite.code, invite.uses || 0);
    });
    client.inviteCache.set(guild.id, map);
  }

  if (previous) {
    db.addInvite(guild.id, previous.inviter, 'rejoin', 1);
    db.setInviteRecord(guild.id, member.id, {
      inviter: previous.inviter,
      joinedAt: Date.now(),
      rejoined: true
    });

    if (settings.inviteLogChannel) {
      const channel = guild.channels.cache.get(settings.inviteLogChannel);
      if (channel) {
        channel.send({
          embeds: [
            ZyronEmbedBuilder.base({
              title: '📨 Member Rejoined',
              description: member.user.tag + ' rejoined **' + guild.name + '**.\n**Original inviter:** <@' + previous.inviter + '>'
            })
          ]
        }).catch(function () {});
      }
    }

    return;
  }

  if (!used || !used.inviter) return;

  const inviterId = used.inviter.id;
  const isFake = Date.now() - member.user.createdTimestamp < 7 * 24 * 60 * 60 * 1000;

  db.addInvite(guild.id, inviterId, 'total', 1);
  db.addInvite(guild.id, inviterId, isFake ? 'fake' : 'real', 1);
  db.setInviteRecord(guild.id, member.id, {
    inviter: inviterId,
    joinedAt: Date.now(),
    rejoined: false
  });

  const inviteReward = Number(settings.economyInvite) > 0 ? Number(settings.economyInvite) : 0;
  if (!isFake && inviteReward > 0 && !used.inviter.bot) {
    db.addCoins(guild.id, inviterId, inviteReward);
  }

  if (settings.inviteLogChannel) {
    const channel = guild.channels.cache.get(settings.inviteLogChannel);
    if (channel) {
      channel.send({
        embeds: [
          ZyronEmbedBuilder.base({
            title: '📨 Invite Tracked',
            description:
              member.user.tag + ' joined **' + guild.name + '**.\n' +
              '**Inviter:** <@' + inviterId + '>\n' +
              '**Invite:** ' + used.code + '\n' +
              '**Type:** ' + (isFake ? 'Fake (new account)' : 'Real') + '\n' +
              '**Reward:** ' + (isFake ? 'No coins (fake account)' : (inviteReward > 0 ? inviteReward + ' coins' : 'Disabled'))
          })
        ]
      }).catch(function () {});
    }
  }
}

client.on('guildMemberAdd', function (member) {
  trackInviteJoin(member).catch(function (err) {
    console.error('Invite tracking error:', err);
  });
});

client.on('guildMemberRemove', function (member) {
  const record = db.getInviteRecord(member.guild.id, member.id);
  if (!record || !record.inviter) return;
  db.addInvite(member.guild.id, record.inviter, 'left', 1);
});

client.on('inviteCreate', function (invite) {
  if (!invite.guild) return;

  const map = client.inviteCache.get(invite.guild.id) || new Map();
  map.set(invite.code, invite.uses || 0);
  client.inviteCache.set(invite.guild.id, map);
});

client.on('inviteDelete', function (invite) {
  if (!invite.guild) return;

  const map = client.inviteCache.get(invite.guild.id) || new Map();
  map.delete(invite.code);
  client.inviteCache.set(invite.guild.id, map);
});

client.on('interactionCreate', async function (interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isAnySelectMenu()) return;

  const commandName = interaction.customId.split(':')[0];

  try {
    if (commandName === 'verify') {
      const action = interaction.customId.split(':')[1];
      if (action === 'accept') {
        return await verification.handleVerificationAccept(interaction);
      }
      return;
    }

    if (commandName === 'rr') {
      const action = interaction.customId.split(':')[1];
      if (action === 'toggle') return await reactionRoles.handleReactionRoleToggle(interaction);
      if (action === 'dropdown') return await reactionRoles.handleDropdownRole(interaction);
      return;
    }

    if (commandName === 'vouch') {
      const action = interaction.customId.split(':')[1];
      if (action === 'open') {
        const targetId = interaction.customId.split(':')[2];
        const target = await interaction.guild.members.fetch(targetId).catch(function () { return null; });
        if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });
        return await vouch.openVouchModal(interaction, target.user);
      }
      if (action === 'submit') return await vouch.handleVouchSubmit(interaction);
      return;
    }

    if (commandName === 'feedback') {
      const action = interaction.customId.split(':')[1];
      if (action === 'rate') {
        const modal = new ModalBuilder()
          .setCustomId('feedback:submit:' + interaction.customId.split(':')[2])
          .setTitle('Rate Your Experience');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('stars')
              .setLabel('Rating (1-5 stars)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('5')
              .setMaxLength(1)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Any comments? (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(false)
          )
        );
        return interaction.showModal(modal);
      }
      if (action === 'submit') {
        const rating = parseInt(interaction.fields.getTextInputValue('stars') || '0', 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          return interaction.reply({ content: 'Rating must be 1-5.', ephemeral: true });
        }
        const record = {
          id: interaction.customId.split(':')[2],
          userId: interaction.user.id,
          stars: rating,
          comment: (interaction.fields.getTextInputValue('comment') || '').slice(0, 500),
          createdAt: Date.now()
        };
        if (!db.data.ticketRatings[interaction.guild.id]) db.data.ticketRatings[interaction.guild.id] = [];
        db.data.ticketRatings[interaction.guild.id].push(record);
        db.save();

        const settings = db.getGuild(interaction.guild.id);
        const logId = settings.feedbackChannel || settings.logChannel;
        const logChannel = logId ? interaction.guild.channels.cache.get(logId) : null;
        if (logChannel) {
          logChannel.send({
            embeds: [ZyronEmbedBuilder.base({
              color: config.colors.primary,
              title: '⭐ Feedback Received',
              description: '**User:** ' + interaction.user.tag + ' (<@' + interaction.user.id + '>)\n' +
                '**Rating:** ' + '⭐'.repeat(rating) + ' (' + rating + '/5)\n' +
                '**Comments:** ' + (record.comment || 'None')
            })]
          }).catch(function () {});
        }

        return interaction.reply({
          embeds: [ZyronEmbedBuilder.success('Thank You!', 'Your feedback has been recorded.')],
          ephemeral: true
        });
      }
      return;
    }

    const command = client.commands.get(commandName);
    if (!command || typeof command.handleInteraction !== 'function') return;
    await command.handleInteraction(client, interaction);
  } catch (err) {
    console.error('Interaction error (' + interaction.customId + '):', err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: 'Something went wrong while handling that action.', ephemeral: true }).catch(function () {});
    }
  }
});

client.on('error', function (err) {
  console.error('Discord client error:', err);
});

process.on('unhandledRejection', function (err) {
  console.error('Unhandled promise rejection:', err);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing. Add it in the .env file or panel variables.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
