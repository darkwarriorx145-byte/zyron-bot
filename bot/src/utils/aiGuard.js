// Zyron AI Guard
// OpenRouter second-opinion engine for anti-nuke, anti-raid and message moderation.
// No template literals are used in this file on purpose.

const CACHE_TTL_MS = 60000;
const MAX_CONCURRENT = 3;
const MAX_QUEUE = 120;

const cache = new Map();
const queue = [];
let active = 0;

function envValue(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function envNumber(name, fallback) {
  const value = parseFloat(envValue(name, ''));
  if (isNaN(value)) return fallback;
  return value;
}

function isConfigured() {
  if (!envValue('OPENROUTER_API_KEY', '')) return false;
  return String(envValue('AI_ENABLED', 'true')) !== 'false';
}

function isEnabled() {
  return String(envValue('AI_ENABLED', 'true')) !== 'false';
}

function getModel(settings) {
  if (settings && settings.aiModel) return String(settings.aiModel);
  return envValue('OPENROUTER_MODEL', 'openrouter/auto');
}

function getFallbackModel() {
  return envValue('OPENROUTER_FALLBACK_MODEL', 'poolside/laguna-s-2.1:free');
}

function getFallbackModel2() {
  return envValue('OPENROUTER_FALLBACK_MODEL_2', 'openrouter/free');
}

function getConfidence(settings) {
  let value = null;
  if (settings && settings.aiConfidence !== undefined && settings.aiConfidence !== null) {
    value = parseFloat(settings.aiConfidence);
  }
  if (value === null || isNaN(value)) value = envNumber('AI_CONFIDENCE', 0.6);
  return Math.max(0.3, Math.min(0.95, value));
}

function getTimeout() {
  return Math.max(4000, Math.min(30000, envNumber('AI_TIMEOUT_MS', 12000)));
}

function status() {
  return {
    configured: isConfigured(),
    enabled: isEnabled(),
    model: envValue('OPENROUTER_MODEL', 'openrouter/auto'),
    fallbackModel: getFallbackModel(),
    timeoutMs: getTimeout(),
    confidence: getConfidence(null),
    queue: queue.length,
    active: active
  };
}

function fence() {
  return String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
}

function extractJson(text) {
  if (!text) return null;
  let value = String(text).trim();
  const marker = fence();
  if (value.indexOf(marker) !== -1) value = value.split(marker).join(' ');

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
          const candidate = value.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
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
    if (label === 'high' || label === 'very high' || label === 'certain') return 0.9;
    if (label === 'medium' || label === 'moderate') return 0.7;
    if (label === 'low' || label === 'very low') return 0.4;
  }

  let number = parseFloat(value);
  if (isNaN(number)) return 0;
  if (number > 1 && number <= 100) number = number / 100;
  return Math.max(0, Math.min(1, number));
}

function sanitizeVerdict(raw, kind) {
  const data = raw || {};
  let verdict = String(data.verdict || 'uncertain').toLowerCase().trim();
  const allowed = kind === 'message'
    ? ['abuse', 'legit', 'uncertain']
    : ['nuke', 'raid', 'abuse', 'legit', 'uncertain'];

  if (allowed.indexOf(verdict) === -1) {
    if (verdict === 'none' || verdict === 'safe' || verdict === 'clean' || verdict === 'normal') {
      verdict = 'legit';
    } else if (verdict === 'malicious' || verdict === 'attack' || verdict === 'destructive' || verdict === 'hostile' || verdict === 'threat') {
      verdict = 'nuke';
    } else if (verdict === 'spam' || verdict === 'toxic' || verdict === 'harassment' || verdict === 'abusive') {
      verdict = 'abuse';
    } else {
      verdict = 'uncertain';
    }
  }

  let action = String(data.action || data.recommendedAction || 'none').toLowerCase().trim();
  if (action === 'block' || action === 'remove' || action === 'delete_message') {
    action = kind === 'message' ? 'delete' : 'ban';
  }
  if (action === 'mute' || action === 'timeout_user' || action === 'restrict') action = 'timeout';
  if (action === 'ignore' || action === 'allow' || action === 'monitor') action = 'none';
  if (['ban', 'kick', 'timeout', 'delete', 'none'].indexOf(action) === -1) action = 'none';
  if (kind === 'message' && action === 'ban') action = 'timeout';

  let severity = String(data.severity || data.threatLevel || 'medium').toLowerCase().trim();
  if (['critical', 'high', 'medium', 'low'].indexOf(severity) === -1) severity = 'medium';

  let category = String(data.category || data.type || 'none').toLowerCase().trim();
  if (category === 'threats') category = 'threat';
  if (category === 'scams') category = 'scam';
  if (category.length > 30) category = category.slice(0, 30);

  const reasonSource = data.reason || data.reasoning || data.analysis || data.explanation || 'No reason returned by the AI.';
  let reason = String(reasonSource);
  reason = reason.replace(/\s+/g, ' ').trim().slice(0, 280);

  return {
    verdict: verdict,
    action: action,
    severity: severity,
    confidence: clampConfidence(data.confidence),
    reason: reason,
    category: category
  };
}

function hashText(text) {
  const value = String(text || '');
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash = hash | 0;
  }
  return Math.abs(hash).toString(36);
}

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), value: value });
}

function clearCache() {
  cache.clear();
}

function enqueue(task) {
  return new Promise(function (resolve) {
    if (queue.length >= MAX_QUEUE) {
      resolve({ ok: false, status: 0, error: 'AI queue is full. Try again shortly.', latency: 0 });
      return;
    }
    queue.push({ task: task, resolve: resolve });
    drain();
  });
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift();
    active++;
    item.task().then(function (result) {
      item.resolve(result);
    }).catch(function (err) {
      item.resolve({ ok: false, status: 0, error: err.message, latency: 0 });
    }).finally(function () {
      active--;
      drain();
    });
  }
}

async function callModelOnce(model, system, user, jsonMode) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, getTimeout());
  const started = Date.now();

  try {
    const payload = {
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0,
      max_tokens: 240
    };

    if (jsonMode) payload.response_format = { type: 'json_object' };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': 'Bearer ' + envValue('OPENROUTER_API_KEY', ''),
        'Content-Type': 'application/json',
        'HTTP-Referer': envValue('OPENROUTER_SITE_URL', 'https://zyranodes.com'),
        'X-Title': envValue('OPENROUTER_APP_NAME', 'Zyron')
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : ('HTTP ' + response.status);
      return {
        ok: false,
        status: response.status,
        error: String(message).slice(0, 240),
        latency: Date.now() - started
      };
    }

    const choice = data && data.choices && data.choices[0] ? data.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : '';
    const parsed = extractJson(content);

    if (!parsed) {
      return {
        ok: false,
        status: response.status,
        error: 'AI returned a non-JSON answer.',
        latency: Date.now() - started
      };
    }

    return {
      ok: true,
      status: response.status,
      raw: parsed,
      model: data.model || model,
      latency: Date.now() - started,
      usage: data.usage || null
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.name === 'AbortError' ? 'AI request timed out.' : err.message,
      latency: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callModel(model, system, user) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, error: 'Node 18 or newer is required for the AI engine.', latency: 0 };
  }

  const first = await callModelOnce(model, system, user, true);
  if (first.ok) return first;

  const rejectedFormat = first.status === 400 || first.status === 422;
  if (!rejectedFormat) return first;

  return callModelOnce(model, system, user, false);
}

async function runAnalysis(model, system, user) {
  if (!isConfigured()) {
    return { ok: false, status: 0, error: 'AI is not configured. Add OPENROUTER_API_KEY to .env.', latency: 0 };
  }

  const chain = [];
  [model, getFallbackModel(), getFallbackModel2()].forEach(function (item) {
    if (item && chain.indexOf(item) === -1) chain.push(item);
  });

  let last = null;

  for (let i = 0; i < chain.length; i++) {
    const result = await enqueue(function () {
      return callModel(chain[i], system, user);
    });

    if (!result.model) result.model = chain[i];

    if (result.ok) {
      if (i > 0) {
        result.fallback = true;
        result.primaryError = last ? last.error : null;
      }
      return result;
    }

    last = result;
    if (result.status === 401 || result.status === 403) break;
  }

  return last || { ok: false, status: 0, error: 'No AI model answered.', latency: 0 };
}

function securitySystem() {
  return [
    'You are Zyron AI Guard, the second-opinion security analyst for a Discord moderation bot.',
    'You receive one JSON description of a suspicious Discord event. Decide if it is a real attack or legitimate activity.',
    '',
    'Decision policy:',
    '1. A destructive action by an untrusted user is hostile: deleting or creating channels or roles, creating webhooks, banning or kicking members, granting Administrator or other dangerous permissions, adding bots, or changing server settings.',
    '2. Mass actions of 3 or more in a short window are nuke-level even if each action looks small.',
    '3. Many joins in seconds, especially from accounts younger than 7 days or without avatars, is a raid.',
    '4. Insults, threats, doxxing, scams, hate speech and NSFW content are abuse.',
    '5. Routine moderation by a whitelisted or trusted user is legit.',
    '6. If the facts are insufficient, answer uncertain with low confidence. Never invent facts.',
    '',
    'Action policy:',
    '- nuke: action ban',
    '- raid: action kick, or ban if the accounts are clearly malicious',
    '- abuse: action timeout',
    '- legit: action none',
    '- uncertain: action none',
    '',
    'Return ONLY one compact JSON object, no markdown, with exactly these keys:',
    '{"verdict":"nuke|raid|abuse|legit|uncertain","severity":"critical|high|medium|low","action":"ban|kick|timeout|none","confidence":0.0,"reason":"max 20 words"}'
  ].join('\n');
}

function messageSystem() {
  return [
    'You are Zyron AI Guard, a Discord message moderator.',
    'Classify the message using the JSON facts provided.',
    '',
    'Policy:',
    '- Profanity alone is a minor infraction: verdict abuse, severity low, action delete.',
    '- Harassment, hate speech, threats, doxxing, scams, NSFW or illegal content: verdict abuse, severity high or critical, action timeout.',
    '- Friendly banter, jokes without a target, quotes, or discussion about moderation: verdict legit, action none.',
    '- Never recommend a ban. The strongest action is timeout.',
    '- If unsure, verdict uncertain and action none.',
    '',
    'Return ONLY one compact JSON object, no markdown, with exactly these keys:',
    '{"verdict":"abuse|legit|uncertain","severity":"critical|high|medium|low","action":"timeout|delete|none","confidence":0.0,"category":"profanity|harassment|hate|threat|doxxing|scam|nsfw|spam|link|none","reason":"max 20 words"}'
  ].join('\n');
}

function raidSystem() {
  return [
    'You are Zyron AI Guard, a Discord raid analyst.',
    'You receive a JSON summary of a join spike. Decide if it is an organized raid or organic growth.',
    '',
    'Raid signs: many joins in seconds, young accounts, similar names, no avatars, coordinated timing.',
    'Organic signs: older accounts, avatars, normal names, a known event, giveaway or partnership.',
    '',
    'Return ONLY one compact JSON object, no markdown, with exactly these keys:',
    '{"verdict":"raid|legit|uncertain","severity":"critical|high|medium|low","action":"kick|ban|none","confidence":0.0,"reason":"max 20 words"}'
  ].join('\n');
}

function buildSecurityPayload(event) {
  const guild = event.guild || null;
  const executor = event.executor || {};
  const guildAge = guild && guild.createdTimestamp
    ? Math.floor((Date.now() - guild.createdTimestamp) / 86400000)
    : null;
  const accountAge = executor.createdTimestamp
    ? Math.floor((Date.now() - executor.createdTimestamp) / 86400000)
    : null;

  return JSON.stringify({
    task: 'discord_security_event',
    event: {
      type: String(event.type || 'anti_nuke'),
      action: String(event.action || 'unknown'),
      reason: String(event.reason || ''),
      target: String(event.target || ''),
      mass: Boolean(event.mass),
      recentActions: event.recentActions || 1
    },
    guild: guild ? {
      name: String(guild.name || 'unknown'),
      members: guild.memberCount || null,
      ageDays: guildAge
    } : null,
    executor: {
      tag: String(executor.tag || executor.username || 'unknown'),
      accountAgeDays: accountAge,
      isBot: executor.bot === true
    },
    extra: event.extra || null
  });
}

async function confirmDestructive(event) {
  const info = event || {};
  const settings = info.settings || null;
  const model = getModel(settings);
  const key = 'sec:' + hashText([
    info.type,
    info.action,
    info.reason,
    info.target,
    info.executor ? info.executor.id : '',
    info.mass
  ].join('|'));

  const cached = getCached(key);
  if (cached) return cached;

  const result = await runAnalysis(model, securitySystem(), buildSecurityPayload(info));
  if (!result.ok) {
    return {
      ok: false,
      verdict: 'uncertain',
      action: 'none',
      severity: 'medium',
      confidence: 0,
      reason: result.error || 'AI unavailable.',
      category: 'none',
      model: result.model || model,
      latency: result.latency || 0,
      error: result.error || 'AI unavailable.'
    };
  }

  const verdict = sanitizeVerdict(result.raw, 'security');
  const final = {
    ok: true,
    verdict: verdict.verdict,
    action: verdict.action,
    severity: verdict.severity,
    confidence: verdict.confidence,
    reason: verdict.reason,
    category: verdict.category,
    model: result.model,
    latency: result.latency,
    fallback: Boolean(result.fallback)
  };

  setCached(key, final);
  return final;
}

async function confirmRaid(event) {
  const info = event || {};
  const settings = info.settings || null;
  const model = getModel(settings);
  const joins = Array.isArray(info.recent) ? info.recent : [];
  const accounts = joins.slice(0, 12).map(function (item) {
    return {
      accountAgeDays: item.accountAgeDays,
      hasAvatar: Boolean(item.hasAvatar),
      name: String(item.name || 'unknown').slice(0, 40)
    };
  });

  const payload = JSON.stringify({
    task: 'discord_raid_check',
    guild: info.guild ? {
      name: String(info.guild.name || 'unknown'),
      members: info.guild.memberCount || null
    } : null,
    joinsInWindow: info.joins || joins.length,
    windowSeconds: info.windowSeconds || 10,
    accounts: accounts
  });

  const key = 'raid:' + hashText(payload);
  const cached = getCached(key);
  if (cached) return cached;

  const result = await runAnalysis(model, raidSystem(), payload);
  if (!result.ok) {
    return {
      ok: false,
      verdict: 'uncertain',
      action: 'none',
      severity: 'medium',
      confidence: 0,
      reason: result.error || 'AI unavailable.',
      model: result.model || model,
      latency: result.latency || 0,
      error: result.error || 'AI unavailable.'
    };
  }

  const verdict = sanitizeVerdict(result.raw, 'security');
  const final = {
    ok: true,
    verdict: verdict.verdict,
    action: verdict.action,
    severity: verdict.severity,
    confidence: verdict.confidence,
    reason: verdict.reason,
    category: verdict.category,
    model: result.model,
    latency: result.latency,
    fallback: Boolean(result.fallback)
  };

  setCached(key, final);
  return final;
}

async function classifyMessage(event) {
  const info = event || {};
  const settings = info.settings || null;
  const model = getModel(settings);
  const content = String(info.content || '').slice(0, 1200);

  const payload = JSON.stringify({
    task: 'discord_message_check',
    guild: info.guild ? { name: String(info.guild.name || 'unknown') } : null,
    channel: info.channelName ? String(info.channelName).slice(0, 60) : null,
    author: {
      accountAgeDays: info.author && info.author.createdTimestamp
        ? Math.floor((Date.now() - info.author.createdTimestamp) / 86400000)
        : null
    },
    message: {
      content: content,
      mentions: info.mentions || 0,
      everyone: Boolean(info.everyone),
      links: info.links || 0
    },
    heuristic: String(info.heuristic || 'risk signal')
  });

  const key = 'msg:' + (info.guild ? info.guild.id : '') + ':' + (info.author ? info.author.id : '') + ':' + hashText(content);
  const cached = getCached(key);
  if (cached) return cached;

  const result = await runAnalysis(model, messageSystem(), payload);
  if (!result.ok) {
    return {
      ok: false,
      verdict: 'uncertain',
      action: 'none',
      severity: 'medium',
      confidence: 0,
      reason: result.error || 'AI unavailable.',
      category: 'none',
      model: result.model || model,
      latency: result.latency || 0,
      error: result.error || 'AI unavailable.'
    };
  }

  const verdict = sanitizeVerdict(result.raw, 'message');
  const final = {
    ok: true,
    verdict: verdict.verdict,
    action: verdict.action,
    severity: verdict.severity,
    confidence: verdict.confidence,
    reason: verdict.reason,
    category: verdict.category,
    model: result.model,
    latency: result.latency,
    fallback: Boolean(result.fallback)
  };

  setCached(key, final);
  return final;
}

module.exports = {
  isConfigured: isConfigured,
  isEnabled: isEnabled,
  status: status,
  getModel: getModel,
  getFallbackModel: getFallbackModel,
  getConfidence: getConfidence,
  getTimeout: getTimeout,
  confirmDestructive: confirmDestructive,
  confirmRaid: confirmRaid,
  classifyMessage: classifyMessage,
  clearCache: clearCache
};
