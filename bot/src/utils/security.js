const {
  PermissionsBitField,
  ChannelType,
  AutoModerationRuleTriggerType,
  AutoModerationRuleEventType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType
} = require('discord.js');
const db = require('../database/db');
const ZyronEmbedBuilder = require('./embedBuilder');
const config = require('../../config.json');

const ENGLISH_WORDS = [
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'motherfucker',
  'motherfucking', 'shit', 'shits', 'shitty', 'bullshit', 'bitch', 'bitches',
  'bitching', 'bastard', 'bastards', 'asshole', 'assholes', 'dick', 'dicks',
  'dickhead', 'cunt', 'cunts', 'whore', 'whores', 'slut', 'sluts', 'retard',
  'retarded', 'faggot', 'faggots', 'nigger', 'niggers', 'nigga', 'niggas',
  'pussy', 'cock', 'cocks', 'twat', 'wanker', 'bollocks', 'douche', 'douchebag',
  'dumbass', 'jackass', 'dipshit', 'prick', 'skank', 'hoe', 'thot'
];

const HINDI_WORDS = [
  'madarchod', 'madarchood', 'madrchod', 'madarchot', 'bhenchod', 'behenchod',
  'bhenchood', 'bhenchot', 'bhosdike', 'bhosdi', 'bhosdika', 'bhosda', 'chutiya',
  'chutya', 'chutiye', 'chutiyapa', 'gaandu', 'gandu', 'gand', 'randi', 'rand',
  'randwa', 'harami', 'haramkhor', 'haramzada', 'kutta', 'kutiya', 'kutte',
  'kamina', 'kamine', 'saala', 'saale', 'bsdk', 'bsdike', 'chodu', 'chod',
  'chodo', 'choda', 'lavda', 'loda', 'lauda', 'lodu', 'jhatu', 'tatte', 'bhadwa',
  'bhadwe', 'chakka', 'gashti', 'kanjar', 'dalal', 'bkl', 'mkc', 'chut', 'choot',
  'lodu', 'gandfat', 'gandmara', 'maakichut'
];

const DEVANAGARI_WORDS = [
  'मादरचोद', 'मदरचोद', 'बहनचोद', 'भेंचोद', 'भोसड़ीके', 'भोसड़ी', 'चूतिया',
  'चुतिया', 'गांडू', 'गांड', 'रंडी', 'हरामी', 'हरामखोर', 'कुत्ता', 'कुतिया',
  'कमीना', 'कमीने', 'साला', 'साले', 'लौड़ा', 'लोडा', 'चोद', 'भड़वा'
];

const PHRASES = [
  'mother fucker', 'mother fuckin', 'son of a bitch', 'bhen chod', 'behen chod',
  'madar chod', 'bhosdi ke', 'gand mara', 'gaand mara', 'maa ki chut',
  'teri maa ki', 'teri maa', 'behen ke lode', 'bhen ke lode', 'chut ke',
  'lund le', 'lauda le', 'tatte chaat', 'bhaand me'
];

const WORD_SET = new Set();
const LONG_WORDS = [];

ENGLISH_WORDS.concat(HINDI_WORDS).concat(DEVANAGARI_WORDS).forEach(function (word) {
  WORD_SET.add(word);
  if (word.length >= 6) LONG_WORDS.push(word);
});

const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't'
};

function normalizeText(text) {
  let value = String(text || '').toLowerCase();
  value = value.replace(/[0-9@$!|+]/g, function (character) {
    return LEET_MAP[character] || character;
  });
  value = value.replace(/[^a-z\u0900-\u097F\s]/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function variants(token) {
  const list = [token];
  list.push(token.replace(/(.)\1+/g, '$1'));
  list.push(token.replace(/(.)\1+/g, '$1$1'));
  return list;
}

const CENSORED_PATTERNS = [
  /(^|[^a-z])f\*+[ck]([^a-z]|$)/i,
  /(^|[^a-z])b\*+tch([^a-z]|$)/i,
  /(^|[^a-z])sh\*+t([^a-z]|$)/i,
  /(^|[^a-z])m\*+d\*+rch\*+d([^a-z]|$)/i,
  /(^|[^a-z])bh\*+nch\*+d([^a-z]|$)/i,
  /(^|[^a-z])ch\*+tiy\*+([^a-z]|$)/i,
  /(^|[^a-z])r\*+ndi([^a-z]|$)/i,
  /(^|[^a-z])bh\*+sdik\*+([^a-z]|$)/i,
  /(^|[^a-z])g\*+ndu([^a-z]|$)/i,
  /(^|[^a-z])l\*+uda([^a-z]|$)/i,
  /(^|[^a-z])k\*+mina([^a-z]|$)/i
];

function findCensored(text) {
  const value = String(text || '');
  for (let i = 0; i < CENSORED_PATTERNS.length; i++) {
    if (CENSORED_PATTERNS[i].test(value)) return 'censored profanity';
  }
  return null;
}

function findProfanity(text) {
  const censored = findCensored(text);
  if (censored) return censored;

  const normalized = normalizeText(text);
  if (!normalized) return null;

  const tokens = normalized.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const forms = variants(tokens[i]);
    for (let f = 0; f < forms.length; f++) {
      const form = forms[f];
      if (WORD_SET.has(form)) return form;

      if (form.length >= 6) {
        for (let w = 0; w < LONG_WORDS.length; w++) {
          if (form.indexOf(LONG_WORDS[w]) !== -1) return LONG_WORDS[w];
        }
      }
    }
  }

  for (let p = 0; p < PHRASES.length; p++) {
    if (normalized.indexOf(PHRASES[p]) !== -1) return PHRASES[p];
  }

  return null;
}

const NATIVE_KEYWORDS = [
  'motherfucker', 'motherfucking', 'bullshit', 'asshole', 'assholes',
  'dumbass', 'dipshit', 'douchebag', 'madarchod', 'madarchood', 'bhenchod',
  'behenchod', 'bhosdike', 'bhosdika', 'chutiya', 'chutiye', 'chutiyapa',
  'haramkhor', 'haramzada', 'gandmara', 'gandfat', 'maakichut', 'bhadwa',
  'bhadwe', 'kutiya'
];

async function provisionAutoMod(guild, settings) {
  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return { ok: false, reason: 'I need the Manage Server permission to create AutoMod rules.' };
  }

  if (!guild.autoModerationRules) {
    return { ok: false, reason: 'This discord.js version does not expose AutoModerationRules. Update discord.js.' };
  }

  const logId = settings.logChannel || null;
  const alertAction = logId
    ? [{ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logId } }]
    : [];

  const blockAction = [{
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: 'Blocked by Zyron AutoMod: that message breaks the server rules.' }
  }];

  const timeoutAction = [{
    type: AutoModerationActionType.Timeout,
    metadata: { durationSeconds: 600 }
  }];

  const rules = [
    {
      name: 'Zyron | Mention Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: 6, mentionRaidProtectionEnabled: true },
      actions: blockAction.concat(alertAction)
    },
    {
      name: 'Zyron | Message Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      triggerMetadata: {},
      actions: blockAction.concat(timeoutAction, alertAction)
    },
    {
      name: 'Zyron | Link Filter',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: ['http://', 'https://', 'www.', 'discord.gg/', 'discord.com/invite/']
      },
      actions: blockAction.concat(alertAction)
    },
    {
      name: 'Zyron | Profanity Filter',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: NATIVE_KEYWORDS },
      actions: blockAction.concat(timeoutAction, alertAction)
    },
    {
      name: 'Zyron | Profanity Preset',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [AutoModerationRuleKeywordPresetType.Profanity, AutoModerationRuleKeywordPresetType.SexualContent]
      },
      actions: blockAction.concat(timeoutAction, alertAction)
    }
  ];

  const existing = await guild.autoModerationRules.fetch().catch(function () {
    return null;
  });

  if (!existing) return { ok: false, reason: 'Could not read the existing AutoMod rules.' };

  const created = [];
  const updated = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const current = existing.find(function (item) {
      return item.name === rule.name;
    });

    try {
      if (current) {
        await current.edit({
          name: rule.name,
          triggerMetadata: rule.triggerMetadata,
          actions: rule.actions
        });
        updated.push(rule.name);
      } else {
        await guild.autoModerationRules.create(rule);
        created.push(rule.name);
      }
    } catch (err) {
      console.error('AutoMod rule failed (' + rule.name + '):', err.message);
    }
  }

  return { ok: true, created: created, updated: updated };
}

async function removeAutoMod(guild) {
  if (!guild.autoModerationRules) return 0;

  const rules = await guild.autoModerationRules.fetch().catch(function () {
    return null;
  });
  if (!rules) return 0;

  let removed = 0;
  const list = Array.from(rules.values());

  for (let i = 0; i < list.length; i++) {
    const rule = list[i];
    if (rule.name.indexOf('Zyron |') !== 0) continue;
    const done = await rule.delete('Zyron AutoMod disabled by an administrator.').then(function () {
      return true;
    }).catch(function () {
      return false;
    });
    if (done) removed++;
  }

  return removed;
}

const RISK_PATTERN = /(kill you|kill urself|kill yourself|kys|i will (?:hurt|kill|find) you|dox(?:x|ing)?|swat(?:ting)?|leak(?:ing)? (?:your|her|his|their) (?:address|number|photos?|nudes?)|home address|phone number|credit card|social security|aadhaar|otp|password|free nitro|steam gift|gift card|scam|crypto giveaway|nude|nudes|child porn|rape|terror|bomb|shoot up|shooting|hack(?:ed|ing)? account|token grabber|ip grabber|discord token|maar dunga|jaan se maar|gala ghont|address bhej)/i;

function hasRiskSignal(text) {
  const value = String(text || '');
  if (!value || value.length < 4) return false;
  return RISK_PATTERN.test(value);
}

const SEVERE_RISK_PATTERN = /(kill you|kill urself|kill yourself|\bkys\b|i will (?:hurt|kill|find|track) you|dox(?:x|ing)?|swat(?:ting)?|child porn|rape you|i will rape|bomb threat|plant a bomb|make a bomb|build a bomb|shoot up|maar dunga|jaan se maar|gala ghont)/i;

function hasSevereRiskSignal(text) {
  const value = String(text || '');
  if (!value || value.length < 3) return false;
  return SEVERE_RISK_PATTERN.test(value);
}

const joinTracker = new Map();
const raidMode = new Map();
const recentJoins = new Map();

function accountAgeDays(member) {
  const created = member && member.user && member.user.createdTimestamp
    ? member.user.createdTimestamp
    : Date.now();
  return Math.floor((Date.now() - created) / 86400000);
}

function trackMemberJoin(guildId, member) {
  const now = Date.now();
  let list = recentJoins.get(guildId) || [];

  list.push({
    id: member.id,
    name: member.user ? member.user.username : 'unknown',
    at: now,
    accountAgeDays: accountAgeDays(member),
    hasAvatar: Boolean(member.user && member.user.avatar),
    isBot: Boolean(member.user && member.user.bot)
  });

  list = list.filter(function (item) {
    return now - item.at < 60000;
  });
  if (list.length > 60) list = list.slice(list.length - 60);

  recentJoins.set(guildId, list);
  return list;
}

function getRecentJoins(guildId, windowMs) {
  const now = Date.now();
  const window = windowMs || 30000;
  const list = recentJoins.get(guildId) || [];
  return list.filter(function (item) {
    return now - item.at < window;
  });
}

function clearRecentJoins(guildId) {
  recentJoins.delete(guildId);
}

function trackJoin(guildId) {
  const now = Date.now();
  let list = joinTracker.get(guildId) || [];
  list.push(now);
  list = list.filter(function (time) {
    return now - time < 10000;
  });
  joinTracker.set(guildId, list);
  return list.length;
}

function isRaid(guildId) {
  const list = joinTracker.get(guildId) || [];
  return list.length >= 8;
}

function startRaidMode(guildId, durationMs) {
  raidMode.set(guildId, Date.now() + (durationMs || 5 * 60 * 1000));
}

function isRaidActive(guildId) {
  const until = raidMode.get(guildId);
  if (!until) return false;
  if (Date.now() > until) {
    raidMode.delete(guildId);
    return false;
  }
  return true;
}

function endRaidMode(guildId) {
  raidMode.delete(guildId);
}

function getLockAlertChannel(guild, settings) {
  if (settings.logChannel) {
    const saved = guild.channels.cache.get(settings.logChannel);
    if (saved) return saved;
  }
  return guild.channels.cache.find(function (channel) {
    return channel.name === 'zyron-logs' && channel.type === ChannelType.GuildText;
  }) || null;
}

async function alertOwners(client, guild, settings, embed) {
  const channel = getLockAlertChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});

  const ids = [];
  if (guild.ownerId) ids.push(guild.ownerId);
  if (process.env.DEFAULT_OWNER_ID) ids.push(process.env.DEFAULT_OWNER_ID);

  const extra = settings.extraOwners || [];
  for (let i = 0; i < extra.length; i++) ids.push(extra[i]);

  const coOwners = db.getCoOwners();
  for (let c = 0; c < coOwners.length; c++) ids.push(coOwners[c]);

  const unique = Array.from(new Set(ids));

  for (let u = 0; u < unique.length; u++) {
    const user = await client.users.fetch(unique[u]).catch(function () {
      return null;
    });
    if (user) user.send({ embeds: [embed] }).catch(function () {});
  }
}

function savedPermission(saved, name) {
  if (!saved) return null;
  if (saved.allow && saved.allow.indexOf(name) !== -1) return true;
  if (saved.deny && saved.deny.indexOf(name) !== -1) return false;
  return null;
}

async function lockGuild(guild, reason) {
  const current = db.getLockdown(guild.id);
  if (current && current.active) {
    return { ok: false, already: true, count: current.count || 0 };
  }

  const everyone = guild.roles.everyone;
  const channels = guild.channels.cache.filter(function (channel) {
    return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  });

  const saved = {};
  let count = 0;

  const list = Array.from(channels.values());

  for (let i = 0; i < list.length; i++) {
    const channel = list[i];
    const overwrite = channel.permissionOverwrites.cache.get(everyone.id);

    saved[channel.id] = {
      allow: overwrite ? overwrite.allow.toArray() : [],
      deny: overwrite ? overwrite.deny.toArray() : []
    };

    const locked = await channel.permissionOverwrites.edit(everyone, {
      SendMessages: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false
    }, { reason: 'Zyron Auto Lockdown: ' + reason }).then(function () {
      return true;
    }).catch(function () {
      return false;
    });

    if (locked) count++;
  }

  db.setLockdown(guild.id, {
    active: true,
    reason: reason,
    lockedAt: Date.now(),
    channels: saved,
    count: count
  });

  return { ok: true, count: count, total: list.length };
}

async function unlockGuild(guild) {
  const state = db.getLockdown(guild.id);
  if (!state || !state.active) return { ok: false, notLocked: true, count: 0 };

  const everyone = guild.roles.everyone;
  let count = 0;

  for (const channelId in state.channels) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    const saved = state.channels[channelId];
    const patch = {
      SendMessages: savedPermission(saved, 'SendMessages'),
      AddReactions: savedPermission(saved, 'AddReactions'),
      CreatePublicThreads: savedPermission(saved, 'CreatePublicThreads'),
      CreatePrivateThreads: savedPermission(saved, 'CreatePrivateThreads')
    };

    const done = await channel.permissionOverwrites.edit(everyone, patch, {
      reason: 'Zyron Lockdown lifted.'
    }).then(function () {
      return true;
    }).catch(function () {
      return false;
    });

    if (done) count++;
  }

  db.clearLockdown(guild.id);
  return { ok: true, count: count };
}

async function startLockdown(client, guild, settings, reason) {
  const result = await lockGuild(guild, reason);
  if (!result.ok && result.already) return result;

  const embed = ZyronEmbedBuilder.base({
    color: config.colors.danger,
    title: '🚨 AUTO LOCKDOWN ACTIVATED',
    description:
      '**' + guild.name + '** was locked down automatically.\n\n' +
      '**Reason:** ' + reason + '\n' +
      '**Locked Channels:** ' + result.count + ' / ' + result.total + '\n' +
      '**Time:** <t:' + Math.floor(Date.now() / 1000) + ':F>\n\n' +
      'Run **' + (settings.prefix || config.prefix) + 'unlockdown** once the threat is gone.'
  });

  await alertOwners(client, guild, settings, embed);
  return result;
}

function lockdownEmbed(guild, state) {
  return ZyronEmbedBuilder.base({
    color: config.colors.danger,
    title: '🔒 Server Lockdown Status',
    description:
      '**Server:** ' + guild.name + '\n' +
      '**Status:** ' + (state && state.active ? '🔴 LOCKED' : '🟢 OPEN') + '\n' +
      '**Reason:** ' + (state && state.reason ? state.reason : 'No active lockdown') + '\n' +
      '**Locked Channels:** ' + (state && state.count ? state.count : 0) + '\n' +
      '**Since:** ' + (state && state.lockedAt ? '<t:' + Math.floor(state.lockedAt / 1000) + ':F>' : 'N/A')
  });
}

module.exports = {
  findProfanity: findProfanity,
  normalizeText: normalizeText,
  hasRiskSignal: hasRiskSignal,
  hasSevereRiskSignal: hasSevereRiskSignal,
  accountAgeDays: accountAgeDays,
  trackMemberJoin: trackMemberJoin,
  getRecentJoins: getRecentJoins,
  clearRecentJoins: clearRecentJoins,
  provisionAutoMod: provisionAutoMod,
  removeAutoMod: removeAutoMod,
  trackJoin: trackJoin,
  isRaid: isRaid,
  startRaidMode: startRaidMode,
  isRaidActive: isRaidActive,
  endRaidMode: endRaidMode,
  lockGuild: lockGuild,
  unlockGuild: unlockGuild,
  startLockdown: startLockdown,
  alertOwners: alertOwners,
  lockdownEmbed: lockdownEmbed,
  getLockAlertChannel: getLockAlertChannel
};
