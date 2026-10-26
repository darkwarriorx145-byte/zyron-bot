const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionsBitField,
  ChannelType,
  AuditLogEvent
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const db = require('./src/database/db');
const ZyronEmbedBuilder = require('./src/utils/embedBuilder');
const channelBackup = require('./src/utils/channelBackup');
const security = require('./src/utils/security');
const aiGuard = require('./src/utils/aiGuard');
const webBridge = require('./src/api/webBridge');

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
const DEFAULT_OWNER_ID = process.env.DEFAULT_OWNER_ID || '';
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

function isMainOwner(userId) {
  return Boolean(DEFAULT_OWNER_ID) && userId === DEFAULT_OWNER_ID;
}

function isBotOwner(userId) {
  return isMainOwner(userId) || db.isCoOwner(userId);
}

function isTrusted(guild, settings, userId, feature) {
  if (!userId) return true;
  if (userId === client.user.id) return true;
  if (settings.betrayed && settings.betrayed.indexOf(userId) !== -1) return false;
  if (isMainOwner(userId)) return true;
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

  let actionTaken = 'No action possible';

  try {
    if (level === 'minor') {
      if (member && member.moderatable) {
        await member.timeout(10 * 60 * 1000, fullReason);
        actionTaken = 'Muted for 10 minutes + warned';
      } else {
        actionTaken = 'Warning recorded (mute not possible)';
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
    db.addWarning(guild.id, userId, { reason: fullReason, moderator: client.user.id });
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

async function guard(guild, settings, options) {
  if (!settings.antiNukeEnabled || !settings.features[options.feature]) return false;

  const entry = await fetchEntry(guild, options.auditType, options.targetId);
  if (!entry || !entry.executor) return false;
  if (entry.executor.id === client.user.id) return false;
  if (options.feature && db.isFeatureWhitelisted(guild.id, options.feature, entry.executor.id)) return false;

  if (isTrusted(guild, settings, entry.executor.id, options.feature)) {
    if (db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) return false;
    if (!settings.features.antiBetrayal || !options.massKey) return false;

    const rogue = hit(guild.id, entry.executor.id, 'betray:' + options.massKey, 15000, 3);
    if (!rogue) return false;

    if (options.revert) {
      await options.revert(entry).catch(function () {});
    }

    await betray(
      guild,
      settings,
      entry.executor.id,
      options.action,
      options.reason + ' (trusted user went rogue)'
    );

    return true;
  }

  const mass = options.massKey
    ? hit(guild.id, entry.executor.id, options.massKey, 10000, options.massLimit || 3)
    : false;

  let ai = null;
  let level = mass ? 'mass' : (options.level || 'severe');
  let override = null;

  if (settings.aiEnabled !== false && aiGuard.isConfigured()) {
    if (mass) {
      ai = {
        ok: true,
        verdict: 'nuke',
        action: 'ban',
        severity: 'critical',
        confidence: 1,
        reason: 'Mass-action threshold reached (' + (options.massLimit || 3) + ' actions in 10 seconds).',
        model: 'deterministic-rules',
        latency: 0
      };
    } else {
      ai = await aiRace(
        aiGuard.confirmDestructive({
          settings: settings,
          type: 'anti_nuke',
          action: options.action,
          reason: options.reason,
          target: options.targetId ? String(options.targetId) : '',
          guild: guild,
          executor: entry.executor,
          mass: false,
          recentActions: 1
        }),
        6000,
        {
          ok: false,
          verdict: 'uncertain',
          action: 'none',
          confidence: 0,
          reason: 'AI timed out, deterministic rules used.',
          model: 'timeout',
          latency: 6000
        }
      );

      if (ai.ok && ai.verdict === 'legit' && ai.confidence >= aiGuard.getConfidence(settings)) {
        await logAiClearance(guild, settings, options.action, ai, options.reason);
        return false;
      }

      if (ai.ok && ai.action === 'ban') {
        level = 'mass';
      } else if (ai.ok && ai.action === 'kick') {
        override = 'kick';
      } else if (ai.ok && ai.action === 'timeout') {
        override = 'timeout';
      }
    }
  }

  if (options.revert) {
    await options.revert(entry).catch(function () {});
  }

  await punish(
    guild,
    settings,
    entry.executor.id,
    options.action,
    options.reason + (mass ? ' (mass action detected)' : ''),
    level,
    {
      action: override,
      timeoutMs: override === 'timeout' ? 60 * 60 * 1000 : null,
      ai: ai
    }
  );

  return true;
}

function runGuard(guild, settings, options) {
  guard(guild, settings, options).catch(function (err) {
    console.error('Anti-Nuke guard error (' + options.action + '):', err);
  });
}

async function handleMinorViolation(guild, settings, authorId, violation, ai) {
  await punish(guild, settings, authorId, 'Minor Infraction', violation, 'minor', { ai: ai || null });
  return true;
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

  const messageGuards = settings.features.antiAbuse ||
    settings.features.antiSpam ||
    settings.features.antiLink ||
    settings.features.antiEveryone ||
    settings.aiScanMessages !== false;

  if (!isCommandMessage && messageGuards) {
    const key = message.guild.id + ':' + message.author.id;
    const onCooldown = minorCooldowns.has(key);

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

    const aiReady = settings.aiEnabled !== false && aiGuard.isConfigured();
    const severeSignal = !violation && security.hasSevereRiskSignal(message.content);
    const riskSignal = !violation &&
      settings.aiScanMessages !== false &&
      aiReady &&
      security.hasRiskSignal(message.content);

    if ((violation || riskSignal || severeSignal) && !onCooldown) {
      if (violation) {
        minorCooldowns.set(key, true);
        setTimeout(function () {
          minorCooldowns.delete(key);
        }, 20000);

        await message.delete().catch(function () {});
      }

      let ai = null;
      if (aiReady) {
        ai = await aiRace(
          aiGuard.classifyMessage({
            settings: settings,
            guild: message.guild,
            channelName: message.channel ? message.channel.name : null,
            author: message.author,
            content: message.content,
            mentions: message.mentions.users.size,
            everyone: pingedEveryone,
            links: (message.content.match(/https?:\/\/|www\.|discord\.gg\//gi) || []).length,
            heuristic: violation || 'risk signal'
          }),
          5000,
          {
            ok: false,
            verdict: 'uncertain',
            action: 'none',
            confidence: 0,
            reason: 'AI timed out.',
            model: 'timeout',
            latency: 5000
          }
        );

        const canClear = !violation || violationFeature === 'antiAbuse';

        if (canClear && ai && ai.ok && ai.verdict === 'legit' && ai.confidence >= aiGuard.getConfidence(settings)) {
          return;
        }
      }

      if (!violation) {
        const aiConfirmed = ai && ai.ok && ai.verdict === 'abuse' && ai.confidence >= aiGuard.getConfidence(settings);

        if (!aiConfirmed && !severeSignal) {
          return;
        }

        minorCooldowns.set(key, true);
        setTimeout(function () {
          minorCooldowns.delete(key);
        }, 20000);

        await message.delete().catch(function () {});
        await handleMinorViolation(
          message.guild,
          settings,
          message.author.id,
          aiConfirmed
            ? 'AI detected ' + (ai.category && ai.category !== 'none' ? ai.category : 'abuse') + ': ' + ai.reason
            : 'Severe threat pattern detected while the AI was unavailable.',
          aiConfirmed ? ai : null
        );
        return;
      }

      await handleMinorViolation(
        message.guild,
        settings,
        message.author.id,
        violation + (ai && ai.ok
          ? ' | AI: ' + String(ai.verdict).toUpperCase() +
            ' (' + Math.round((ai.confidence || 0) * 100) + '%)'
          : ''),
        ai
      );
      return;
    }
  }

  if (!message.content.startsWith(prefix)) return;

  const raw = message.content.slice(prefix.length).trim();
  if (!raw) return;

  const args = raw.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName) || client.commands.find(function (cmd) {
    return cmd.aliases && cmd.aliases.indexOf(commandName) !== -1;
  });

  if (!command) return;

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

  runGuard(guild, settings, {
    feature: 'antiBan',
    auditType: AuditLogEvent.MemberBanAdd,
    targetId: ban.user.id,
    action: 'Anti Ban',
    reason: 'Unauthorized ban of ' + ban.user.tag,
    massKey: 'ban',
    revert: function () {
      return guild.bans.remove(ban.user.id, 'Zyron Anti-Nuke: reverting unauthorized ban.');
    }
  });
});

client.on('guildMemberRemove', async function (member) {
  const guild = member.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled) return;

  if (settings.features.antiKick) {
    const kick = await fetchEntry(guild, AuditLogEvent.MemberKick, member.id);
    if (kick && kick.executor && !db.isFeatureWhitelisted(guild.id, 'antiKick', kick.executor.id)) {
      if (isTrusted(guild, settings, kick.executor.id, 'antiKick')) {
        if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', kick.executor.id)) {
          const rogue = hit(guild.id, kick.executor.id, 'betray:kick', 15000, 3);
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
    if (prune && prune.executor && !db.isFeatureWhitelisted(guild.id, 'antiPrune', prune.executor.id)) {
      if (isTrusted(guild, settings, prune.executor.id, 'antiPrune')) {
        if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', prune.executor.id)) {
          const rogue = hit(guild.id, prune.executor.id, 'betray:prune', 15000, 3);
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

  runGuard(guild, settings, {
    feature: 'antiBotAdd',
    auditType: AuditLogEvent.BotAdd,
    targetId: member.id,
    action: 'Anti Bot Add',
    reason: 'Added unauthorized bot ' + member.user.tag,
    massKey: 'botAdd',
    revert: function () {
      return member.kick('Zyron Anti-Nuke: unauthorized bot.');
    }
  });
});

client.on('channelCreate', function (channel) {
  if (!channel.guild) return;
  const guild = channel.guild;
  const settings = db.getGuild(guild.id);

  channelBackup.saveChannel(guild.id, channel);

  runGuard(guild, settings, {
    feature: 'antiChannelCreate',
    auditType: AuditLogEvent.ChannelCreate,
    targetId: channel.id,
    action: 'Anti Channel Create',
    reason: 'Created channel #' + channel.name,
    massKey: 'channelCreate',
    revert: function () {
      return channel.delete('Zyron Anti-Nuke: unauthorized channel creation.');
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
  const trusted = executorId ? isTrusted(guild, settings, executorId, 'antiChannelDelete') : false;

  if (trusted && executorId === client.user.id) {
    db.removeChannelBackup(guild.id, channel.id);
    return;
  }

  if (!trusted && settings.features.antiChannelRecovery) {
    const backup = db.getChannelBackup(guild.id, channel.id);
    if (backup) {
      const restored = await channelBackup.restore(guild, Object.assign({}, backup, { oldId: channel.id }));
      if (restored) console.log('Restored deleted channel ' + channel.name + ' in ' + guild.name);
    }
  }

  runGuard(guild, settings, {
    feature: 'antiChannelDelete',
    auditType: AuditLogEvent.ChannelDelete,
    targetId: channel.id,
    action: 'Anti Channel Delete',
    reason: 'Deleted channel #' + channel.name,
    massKey: 'channelDelete'
  });
});

client.on('channelUpdate', function (oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const guild = newChannel.guild;
  const settings = db.getGuild(guild.id);

  channelBackup.saveChannel(guild.id, newChannel);

  runGuard(guild, settings, {
    feature: 'antiChannelUpdate',
    auditType: AuditLogEvent.ChannelUpdate,
    targetId: newChannel.id,
    action: 'Anti Channel Update',
    reason: 'Updated channel #' + newChannel.name,
    massKey: 'channelUpdate',
    massLimit: 4
  });
});

client.on('roleCreate', function (role) {
  const guild = role.guild;
  const settings = db.getGuild(guild.id);

  runGuard(guild, settings, {
    feature: 'antiRoleCreate',
    auditType: AuditLogEvent.RoleCreate,
    targetId: role.id,
    action: 'Anti Role Create',
    reason: 'Created role ' + role.name,
    massKey: 'roleCreate',
    revert: function () {
      return role.delete('Zyron Anti-Nuke: unauthorized role creation.');
    }
  });
});

client.on('roleDelete', function (role) {
  const guild = role.guild;
  const settings = db.getGuild(guild.id);

  runGuard(guild, settings, {
    feature: 'antiRoleDelete',
    auditType: AuditLogEvent.RoleDelete,
    targetId: role.id,
    action: 'Anti Role Delete',
    reason: 'Deleted role ' + role.name,
    massKey: 'roleDelete'
  });
});

client.on('roleUpdate', async function (oldRole, newRole) {
  const guild = newRole.guild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled) return;

  const entry = await fetchEntry(guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiRoleUpdate', entry.executor.id)) return;

  if (isTrusted(guild, settings, entry.executor.id, 'antiRoleUpdate')) {
    if (!settings.features.antiBetrayal || db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) return;

    const rogue = hit(guild.id, entry.executor.id, 'betray:roleUpdate', 15000, 3);
    if (!rogue) return;

    await betray(guild, settings, entry.executor.id, 'Anti Betrayal (Role Update)', 'Repeated role updates by a trusted user');
    return;
  }

  const danger = DANGEROUS.some(function (perm) {
    return newRole.permissions.has(perm) && !oldRole.permissions.has(perm);
  });

  if (danger && settings.features.antiDangerousPermissionUpdate) {
    if (db.isFeatureWhitelisted(guild.id, 'antiDangerousPermissionUpdate', entry.executor.id)) return;
    await newRole.setPermissions(oldRole.permissions, 'Zyron Anti-Nuke: reverting dangerous permissions.').catch(function () {});
    await punish(
      guild,
      settings,
      entry.executor.id,
      'Anti Dangerous Permission Update',
      'Granted dangerous permissions to role ' + newRole.name,
      'mass'
    );
    return;
  }

  if (settings.features.antiRoleUpdate) {
    await punish(guild, settings, entry.executor.id, 'Anti Role Update', 'Updated role ' + newRole.name, 'severe');
  }
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
  if (db.isFeatureWhitelisted(guild.id, 'antiWebhook', entry.executor.id)) return;

  if (isTrusted(guild, settings, entry.executor.id, 'antiWebhook')) {
    if (!settings.features.antiBetrayal || db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) return;

    const rogue = hit(guild.id, entry.executor.id, 'betray:webhook', 15000, 3);
    if (!rogue) return;

    await betray(guild, settings, entry.executor.id, 'Anti Betrayal (Webhook)', 'Repeated webhook changes by a trusted user');
    return;
  }

  const hooks = await channel.fetchWebhooks().catch(function () {
    return null;
  });

  if (hooks && entry.action === AuditLogEvent.WebhookCreate) {
    hooks.forEach(function (hook) {
      if (hook.ownerId !== client.user.id) {
        hook.delete('Zyron Anti-Nuke: unauthorized webhook.').catch(function () {});
      }
    });
  }

  await punish(guild, settings, entry.executor.id, 'Anti Webhook', 'Created or edited a webhook in #' + channel.name, 'severe');
});

client.on('guildUpdate', async function (oldGuild, newGuild) {
  const guild = newGuild;
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiGuildUpdate) return;

  const entry = await fetchEntry(guild, AuditLogEvent.GuildUpdate, guild.id);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiGuildUpdate', entry.executor.id)) return;

  if (isTrusted(guild, settings, entry.executor.id, 'antiGuildUpdate')) {
    if (!settings.features.antiBetrayal || db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) return;

    const rogue = hit(guild.id, entry.executor.id, 'betray:guildUpdate', 15000, 3);
    if (!rogue) return;

    await betray(guild, settings, entry.executor.id, 'Anti Betrayal (Guild Update)', 'Repeated server changes by a trusted user');
    return;
  }

  if (oldGuild.name !== newGuild.name) {
    await newGuild.setName(oldGuild.name, 'Zyron Anti-Nuke: reverting guild name.').catch(function () {});
  }
  if (oldGuild.iconURL() !== newGuild.iconURL()) {
    await newGuild.setIcon(oldGuild.iconURL(), 'Zyron Anti-Nuke: reverting guild icon.').catch(function () {});
  }

  await punish(guild, settings, entry.executor.id, 'Anti Guild Update', 'Changed server settings', 'severe');
});

client.on('guildIntegrationsUpdate', async function (guild) {
  const settings = db.getGuild(guild.id);
  if (!settings.antiNukeEnabled || !settings.features.antiIntegration) return;

  let entry = await fetchEntry(guild, AuditLogEvent.IntegrationCreate, null);
  if (!entry) entry = await fetchEntry(guild, AuditLogEvent.IntegrationUpdate, null);
  if (!entry) entry = await fetchEntry(guild, AuditLogEvent.IntegrationDelete, null);
  if (!entry || !entry.executor) return;
  if (entry.executor.id === client.user.id) return;
  if (db.isFeatureWhitelisted(guild.id, 'antiIntegration', entry.executor.id)) return;

  if (isTrusted(guild, settings, entry.executor.id, 'antiIntegration')) {
    if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) {
      const rogue = hit(guild.id, entry.executor.id, 'betray:integration', 15000, 3);
      if (rogue) {
        await betray(guild, settings, entry.executor.id, 'Anti Betrayal (Integration)', 'Repeated integration changes by a trusted user');
      }
    }
    return;
  }

  await punish(guild, settings, entry.executor.id, 'Anti Integration', 'Added, edited or removed an integration', 'severe');
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
  if (db.isFeatureWhitelisted(guild.id, 'antiMemberUpdate', entry.executor.id)) return;

  if (isTrusted(guild, settings, entry.executor.id, 'antiMemberUpdate')) {
    if (settings.features.antiBetrayal && !db.isFeatureWhitelisted(guild.id, 'antiBetrayal', entry.executor.id)) {
      const rogue = hit(guild.id, entry.executor.id, 'betray:memberUpdate', 15000, 3);
      if (rogue) {
        await newMember.roles.set(oldMember.roles.cache.map(function (role) {
          return role.id;
        }), 'Zyron Anti-Betrayal: reverting dangerous role grant.').catch(function () {});
        await betray(guild, settings, entry.executor.id, 'Anti Betrayal (Member Update)', 'Mass granted dangerous roles');
      }
    }
    return;
  }

  await newMember.roles.set(oldMember.roles.cache.map(function (role) {
    return role.id;
  }), 'Zyron Anti-Nuke: reverting dangerous role grant.').catch(function () {});

  await punish(
    guild,
    settings,
    entry.executor.id,
    'Anti Member Update',
    'Gave ' + newMember.user.tag + ' the dangerous role ' + addedRole.name,
    'mass'
  );
});

function raidKey(guildId, userId) {
  return guildId + ':' + userId;
}

async function punishRaidMember(guild, settings, member, ai) {
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

  if (settings.autoRoleId) {
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
  const command = client.commands.get(commandName);

  if (!command || typeof command.handleInteraction !== 'function') return;

  try {
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
