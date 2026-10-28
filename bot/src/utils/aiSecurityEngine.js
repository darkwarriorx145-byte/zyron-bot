const aiGuard = require('./aiGuard');
const db = require('../database/db');
const config = require('../../config.json');

const AI_DECISION_CACHE_TTL = 30000;
const decisionCache = new Map();

function cacheKey(prefix, ...parts) {
  return prefix + ':' + parts.map(String).join('|');
}

function getCached(key) {
  const item = decisionCache.get(key);
  if (!item) return null;
  if (Date.now() - item.at > AI_DECISION_CACHE_TTL) {
    decisionCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  if (decisionCache.size > 1000) decisionCache.clear();
  decisionCache.set(key, { at: Date.now(), value: value });
}

async function aiDecide(settings, payload) {
  if (!settings || settings.aiEnabled === false) return null;
  if (!aiGuard.isConfigured()) return null;

  const key = cacheKey('decide', payload.type, payload.executorId, payload.guildId, JSON.stringify(payload.context || {}));
  const cached = getCached(key);
  if (cached) return cached;

  const systemPrompt = buildSystemPrompt(payload.type);
  const userPrompt = buildUserPrompt(payload);

  const result = await aiGuard.chat(settings, systemPrompt, userPrompt);
  if (!result || !result.ok || !result.text) return null;

  let decision = null;
  try {
    decision = JSON.parse(result.text);
  } catch (err) {
    const extracted = extractJson(result.text);
    if (extracted) decision = extracted;
  }
  if (!decision) return null;

  const normalized = normalizeDecision(decision, payload.type);
  setCached(key, normalized);
  return normalized;
}

function buildSystemPrompt(type) {
  const base = [
    'You are Zyron AI Security Engine, the central decision maker for all moderation actions.',
    'You receive a JSON context and must return a single JSON decision.',
    '',
    'CORE PRINCIPLES:',
    '- Default to ALLOW unless confidence >= 0.85 that action is malicious.',
    '- Trusted users (owner, whitelisted, extra owners) get benefit of doubt unless pattern is clearly malicious.',
    '- Bot actions must be verified: only allow if bot is on trusted-bots list OR action initiated by trusted human.',
    '- Mass actions (3+ in 10s) are suspicious regardless of actor.',
    '- Consider user history: account age, previous infractions, staff status.',
    '',
    'RETURN ONLY THIS JSON (no markdown, no extra text):',
    '{"action":"allow|timeout|kick|ban|lockdown","confidence":0.0,"reason":"max 25 words","severity":"low|medium|high|critical","evidence":["fact1","fact2"]}'
  ].join('\n');

  const typeSpecific = {
    message: 'MESSAGE MODERATION: Detect spam, mass mentions, links, raids, scams, NSFW. Action: allow/timeout.',
    channel_create: 'CHANNEL CREATE: Legitimate admin work vs nuke. Check: bulk creation, naming patterns, executor trust.',
    channel_delete: 'CHANNEL DELETE: Recovery vs destruction. Check: count, importance, executor trust.',
    role_create: 'ROLE CREATE: Admin vs backdoor. Check: permissions granted, naming, executor trust.',
    role_delete: 'ROLE DELETE: Cleanup vs sabotage. Check: role importance, executor trust.',
    role_update: 'ROLE UPDATE: Permission escalation? Check: dangerous perms added, executor trust.',
    ban: 'BAN: Legitimate mod vs purge. Check: reason, count, executor trust, victim history.',
    kick: 'KICK: Legitimate mod vs purge. Check: reason, count, executor trust.',
    bot_add: 'BOT ADD: Authorized vs supply chain. Check: bot verification, permissions, who invited.',
    webhook: 'WEBHOOK: Legitimate vs spam/exfil. Check: channel, executor trust.',
    member_update: 'MEMBER UPDATE: Role grant. Check: dangerous perms, executor trust, target history.',
    integration: 'INTEGRATION: Legitimate vs backdoor. Check: type, executor trust.',
    guild_update: 'GUILD UPDATE: Settings change. Check: critical settings (name, icon, verification), executor trust.'
  };

  return base + '\n\nCONTEXT TYPE: ' + type + '\n' + (typeSpecific[type] || '');
}

function buildUserPrompt(payload) {
  return JSON.stringify({
    guild: payload.guild || {},
    executor: payload.executor || {},
    target: payload.target || {},
    action: payload.action || '',
    context: payload.context || {},
    history: payload.history || [],
    timestamp: Date.now()
  }, null, 0);
}

function normalizeDecision(raw, type) {
  const allowedActions = ['allow', 'timeout', 'kick', 'ban', 'lockdown'];
  let action = String(raw.action || 'allow').toLowerCase();
  if (!allowedActions.includes(action)) action = 'allow';

  let confidence = clamp(raw.confidence, 0, 1);
  let severity = String(raw.severity || 'low').toLowerCase();
  if (!['low', 'medium', 'high', 'critical'].includes(severity)) severity = 'low';

  let reason = String(raw.reason || 'AI decision').slice(0, 200);
  let evidence = Array.isArray(raw.evidence) ? raw.evidence.slice(0, 5).map(String) : [];

  if (type === 'message' && action === 'ban') action = 'timeout';

  return { action, confidence, reason, severity, evidence };
}

function clamp(v, min, max) {
  const n = parseFloat(v);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function extractJson(text) {
  if (!text) return null;
  const str = String(text).trim();
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < str.length; j++) {
      const ch = str[j];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(str.slice(i, j + 1)); } catch (e) { break; } } }
    }
  }
  return null;
}

function isTrustedExecutor(guild, settings, executorId) {
  if (!executorId) return false;
  if (executorId === guild.client.user.id) return true;
  if (executorId === guild.ownerId) return true;
  if (settings.extraOwners && settings.extraOwners.includes(executorId)) return true;
  if (db.isWhitelisted(guild.id, executorId)) return true;
  if (db.isCoOwner(executorId)) return true;
  return false;
}

function isTrustedBot(guild, settings, botId) {
  if (!botId) return false;
  const trustedBots = settings.trustedBots || [];
  if (trustedBots.includes(botId)) return true;
  const botMember = guild.members.cache.get(botId);
  if (!botMember) return false;
  return botMember.user.bot && isTrustedExecutor(guild, settings, botMember.user.id);
}

async function evaluateBotAction(guild, settings, auditEntry, actionType) {
  const executor = auditEntry.executor;
  if (!executor || !executor.bot) return { action: 'allow', reason: 'Not a bot action' };

  const trusted = isTrustedBot(guild, settings, executor.id);
  if (trusted) return { action: 'allow', reason: 'Trusted bot' };

  const inviter = await findBotInviter(guild, executor.id);
  const inviterTrusted = inviter ? isTrustedExecutor(guild, settings, inviter.id) : false;
  if (inviterTrusted) return { action: 'allow', reason: 'Bot invited by trusted user' };

  return {
    action: 'timeout',
    confidence: 0.9,
    reason: 'Untrusted bot performed ' + actionType,
    severity: 'high',
    evidence: ['Bot not in trusted list', 'Inviter not trusted', 'Action: ' + actionType]
  };
}

async function findBotInviter(guild, botId) {
  try {
    const audit = await guild.fetchAuditLogs({ type: 42, limit: 10 });
    const entry = audit.entries.find(e => e.target && e.target.id === botId);
    return entry ? entry.executor : null;
  } catch (err) {
    return null;
  }
}

async function evaluateMessage(guild, settings, message) {
  const payload = {
    type: 'message',
    guildId: guild.id,
    executorId: message.author.id,
    guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
    executor: { id: message.author.id, tag: message.author.tag, bot: message.author.bot, accountAgeDays: Math.floor((Date.now() - message.author.createdTimestamp) / 86400000) },
    target: { channelId: message.channel.id, channelName: message.channel.name },
    action: 'message_scan',
    context: {
      content: message.content.slice(0, 2000),
      mentions: message.mentions.users.size,
      everyone: message.mentions.everyone,
      links: (message.content.match(/https?:\/\/|discord\.gg\//gi) || []).length,
      attachments: message.attachments.size
    },
    history: await getUserHistory(guild.id, message.author.id)
  };
  return aiDecide(settings, payload);
}

async function evaluateAuditAction(guild, settings, auditEntry, actionType, extraContext = {}) {
  const executor = auditEntry.executor;
  if (!executor) return { action: 'allow', reason: 'No executor found' };

  if (isTrustedExecutor(guild, settings, executor.id)) {
    const massCheck = await checkMassAction(guild, executor.id, actionType);
    if (massCheck.isMass) {
      return {
        action: 'ban',
        confidence: 0.95,
        reason: 'Trusted user mass ' + actionType + ' (' + massCheck.count + ' in 10s)',
        severity: 'critical',
        evidence: ['Trusted user', 'Mass action detected', 'Count: ' + massCheck.count]
      };
    }
    return { action: 'allow', reason: 'Trusted executor, no mass pattern' };
  }

  const payload = {
    type: actionType,
    guildId: guild.id,
    executorId: executor.id,
    guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
    executor: { id: executor.id, tag: executor.tag, bot: executor.bot, accountAgeDays: executor.createdTimestamp ? Math.floor((Date.now() - executor.createdTimestamp) / 86400000) : null },
    target: { id: auditEntry.target ? auditEntry.target.id : null },
    action: actionType,
    context: extraContext,
    history: await getUserHistory(guild.id, executor.id)
  };
  return aiDecide(settings, payload);
}

const massActionWindows = new Map();
function checkMassAction(guild, userId, actionType) {
  const key = guild.id + ':' + userId + ':' + actionType;
  const now = Date.now();
  const window = massActionWindows.get(key) || [];
  const recent = window.filter(ts => now - ts < 10000);
  recent.push(now);
  massActionWindows.set(key, recent);
  return { isMass: recent.length >= 3, count: recent.length };
}

async function getUserHistory(guildId, userId) {
  const warnings = db.getWarnings(guildId, userId) || [];
  const tickets = db.getTickets(guildId) || [];
  const userTickets = tickets.filter(t => t.userId === userId);
  const recentInfractions = warnings.filter(w => Date.now() - (w.timestamp || 0) < 7 * 86400000).length;
  return {
    warningCount: warnings.length,
    recentWarnings: recentInfractions,
    ticketCount: userTickets.length,
    isStaff: false
  };
}

async function executeDecision(guild, settings, decision, executorId, targetId, reason, auditEntry) {
  if (!decision || decision.action === 'allow') return { executed: false, reason: 'Allowed by AI' };

  const executor = await guild.members.fetch(executorId).catch(() => null);
  const target = targetId ? await guild.members.fetch(targetId).catch(() => null) : null;

  let actionTaken = 'none';
  const fullReason = 'Zyron AI Security | ' + reason + ' | Confidence: ' + Math.round(decision.confidence * 100) + '%';

  try {
    switch (decision.action) {
      case 'timeout':
        if (executor && executor.moderatable) {
          await executor.timeout(10 * 60 * 1000, fullReason);
          actionTaken = 'Timed out 10 minutes';
        }
        break;
      case 'kick':
        if (executor && executor.kickable) {
          await executor.kick(fullReason);
          actionTaken = 'Kicked';
        }
        break;
      case 'ban':
        if (executor && executor.bannable) {
          await executor.ban({ reason: fullReason, deleteMessageSeconds: 0 });
          actionTaken = 'Banned';
        } else if (executor) {
          await executor.kick(fullReason);
          actionTaken = 'Kicked (ban blocked by hierarchy)';
        }
        break;
      case 'lockdown':
        const sec = require('./security');
        await sec.startLockdown(guild.client, guild, settings, 'AI Security: ' + reason);
        actionTaken = 'Server lockdown initiated';
        break;
    }
  } catch (err) {
    return { executed: false, reason: 'Execution failed: ' + err.message };
  }

  if (decision.action !== 'allow') {
    db.addWarning(guild.id, executorId, {
      reason: fullReason,
      moderator: guild.client.user.id,
      type: 'ai-security',
      source: 'ai-engine'
    });
  }

  const logChannel = guild.channels.cache.get(settings.logChannel) || guild.channels.cache.find(c => c.name === 'zyron-logs');
  if (logChannel) {
    const { EmbedBuilder } = require('discord.js');
    logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(decision.severity === 'critical' ? 0xFF0000 : decision.severity === 'high' ? 0xFF5500 : 0xFFAA00)
        .setTitle('AI Security Action')
        .setDescription('**Executor:** ' + (executor ? executor.user.tag : executorId) + '\n**Action:** ' + decision.action + '\n**Reason:** ' + reason + '\n**Confidence:** ' + Math.round(decision.confidence * 100) + '%\n**Severity:** ' + decision.severity)
        .setTimestamp()
      ]
    }).catch(() => {});
  }

  return { executed: true, actionTaken };
}

module.exports = {
  aiDecide,
  evaluateMessage,
  evaluateAuditAction,
  evaluateBotAction,
  executeDecision,
  isTrustedExecutor,
  isTrustedBot,
  checkMassAction,
  clearCache: () => decisionCache.clear()
};