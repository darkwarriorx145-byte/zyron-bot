const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ButtonBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const config = require('../../config.json');

const FALLBACK_EMOJIS = {
  shield: '⛨',
  party: '✦',
  crown: '♛',
  lock: '⊘',
  unlock: '◉',
  warning: '⚑',
  success: '✦',
  error: '⨯',
  ban: '⛔',
  kick: '↯',
  mute: '⌁',
  warn: '⚑',
  warn_alt: '⚑',
  settings: '⌘',
  dot: '•',
  bot: '◈',
  lightning: 'ϟ',
  info: '◈',
  user: '◉',
  mention: '﹫',
  id: '⌗',
  added_by: '⤷',
  expiry: '⧖',
  timestamp: '◷',
  spark: '✧',
  on: '✓',
  off: '✕',
  star: '★',
  purge: '⌫',
  purge_alt: '⌫',
  online: '●',
  offline: '○',
  disabled: '✕',
  role: '♛',
  owner: '♛',
  log: '≡',
  log_alt: '≡',
  box: '□',
  box_alt: '□',
  channel: '#',
  link: '∞',
  link_alt: '∞',
  link_clip: '∞',
  trash: '✕',
  alarm: '!',
  server: '▤',
  whitelist: '⛨',
  economy: '▥',
  coin: '$',
  ticket: '%',
  giveaway: '□',
  poll: '◔',
  invites: '＋',
  id_card: 'ID',
  help: '?',
  ledger: '▤',
  back: '⛨',
  search: '⌕',
  clock: '◷',
  calendar: '▦',
  final_check: '✓',
  final_cross: '✕',
  arrow: '→',
  loading: '…',
  enabled: '✓',
  emergency: '!',
  raid: '⚑',
  nuke: '☢',
  profile: 'ID',
  check: '✓',
  cross: '✕',
  ai: 'AI',
  backup: '☁'
};

const EMOJI_MAP = {
  '🛡️': 'shield',
  '🛡': 'shield',
  '⚙️': 'settings',
  '⚙': 'settings',
  '🎉': 'party',
  '👑': 'crown',
  '🔒': 'lock',
  '🔓': 'unlock',
  '⚠️': 'warning',
  '⚠': 'warning',
  '✅': 'success',
  '❌': 'error',
  '🔨': 'ban',
  '👢': 'kick',
  '🔇': 'mute',
  '📜': 'warn',
  '🤖': 'bot',
  '⚡': 'lightning',
  'ℹ️': 'info',
  'ℹ': 'info',
  '💰': 'crown',
  '📨': 'spark',
  '📊': 'info',
  '🏆': 'crown',
  '👤': 'user',
  '🧠': 'bot',
  '🔍': 'info',
  '📝': 'warn',
  '🎫': 'spark',
  '🙋': 'user',
  '✏️': 'settings',
  '✏': 'settings',
  '➕': 'success',
  '➖': 'error',
  '🏠': 'info',
  '💸': 'spark',
  '⏳': 'expiry',
  '🚨': 'warning',
  '🔴': 'error',
  '🟢': 'success',
  '📋': 'info',
  '🌐': 'spark',
  '🕵️': 'user',
  '🕵': 'user',
  '🎯': 'spark',
  '💬': 'info',
  '📖': 'info',
  '🔗': 'spark',
  '📌': 'info',
  '⭐': 'spark',
  '✨': 'spark',
  '🔥': 'spark',
  '💎': 'spark',
  '🪙': 'crown',
  '🎁': 'party',
  '📢': 'info',
  '🔔': 'warning',
  '🚫': 'error',
  '⛔': 'error',
  '🔧': 'settings',
  '🛠️': 'settings',
  '🛠': 'settings',
  '📁': 'info',
  '📂': 'info',
  '🗑️': 'error',
  '🗑': 'error',
  '🧹': 'error',
  '🔁': 'spark',
  '🔄': 'spark',
  '➡️': 'added_by',
  '➡': 'added_by',
  '⬅️': 'added_by',
  '⬅': 'added_by',
  '↩️': 'added_by',
  '↩': 'added_by',
  '⏱️': 'timestamp',
  '⏱': 'timestamp',
  '⏰': 'timestamp',
  '📅': 'timestamp',
  '🆔': 'id',
  '👍': 'success',
  '👎': 'error',
  '🔟': 'info',
  '🎂': 'party',
  '🌍': 'info',
  '📚': 'info',
  '💡': 'spark',
  '📣': 'info',
  '📥': 'info',
  '📤': 'info',
  '📦': 'info',
  '🧾': 'info',
  '🗓️': 'timestamp',
  '🗓': 'timestamp',
  '🔖': 'info',
  '🪄': 'spark',
  '🎨': 'spark',
  '🖥️': 'settings',
  '🖥': 'settings',
  '💻': 'settings',
  '📱': 'settings',
  '🛜': 'lightning',
  '📶': 'lightning',
  '🔌': 'lightning',
  '🔋': 'lightning',
  '🧩': 'settings',
  '⚔️': 'shield',
  '⚔': 'shield',
  '🗡️': 'ban',
  '🗡': 'ban',
  '🛑': 'error',
  '🚀': 'spark',
  '🎈': 'party',
  '🎊': 'party',
  '🥳': 'party',
  '🛡️': 'shield',
  '🛡': 'shield',
  '⚙️': 'settings',
  '⚙': 'settings',
  '🎉': 'party',
  '👑': 'owner',
  '🔒': 'lock',
  '🔓': 'unlock',
  '⚠️': 'warning',
  '⚠': 'warning',
  '✅': 'success',
  '❌': 'error',
  '🔨': 'ban',
  '👢': 'kick',
  '🔇': 'mute',
  '📜': 'warn',
  '🤖': 'ai',
  '⚡': 'lightning',
  'ℹ️': 'info',
  'ℹ': 'info',
  '💰': 'economy',
  '📨': 'invites',
  '📊': 'economy',
  '🏆': 'crown',
  '👤': 'user',
  '🧠': 'ai',
  '🔍': 'search',
  '📝': 'warn',
  '🎫': 'ticket',
  '🙋': 'invites',
  '✏️': 'settings',
  '✏': 'settings',
  '➕': 'check',
  '➖': 'cross',
  '🏠': 'info',
  '💸': 'coin',
  '⏳': 'expiry',
  '🚨': 'alarm',
  '🔴': 'error',
  '🟢': 'online',
  '📋': 'log',
  '🌐': 'link',
  '🕵️': 'whitelist',
  '🕵': 'whitelist',
  '🎯': 'star',
  '💬': 'help',
  '📖': 'ledger',
  '🔗': 'link',
  '📌': 'log',
  '⭐': 'star',
  '✨': 'spark',
  '🔥': 'lightning',
  '💎': 'coin',
  '🪙': 'coin',
  '🎁': 'giveaway',
  '📢': 'alarm',
  '🔔': 'alarm',
  '🚫': 'ban',
  '⛔': 'ban',
  '🔧': 'settings',
  '🛠️': 'settings',
  '🛠': 'settings',
  '📁': 'box',
  '📂': 'box',
  '🗑️': 'trash',
  '🗑': 'trash',
  '🧹': 'purge',
  '🔁': 'loading',
  '🔄': 'loading',
  '➡️': 'arrow',
  '➡': 'arrow',
  '⬅️': 'arrow',
  '⬅': 'arrow',
  '↩️': 'arrow',
  '↩': 'arrow',
  '⏱️': 'clock',
  '⏱': 'clock',
  '⏰': 'clock',
  '📅': 'calendar',
  '🆔': 'id',
  '👍': 'check',
  '👎': 'cross',
  '🔟': 'info',
  '🎂': 'party',
  '🌍': 'server',
  '📚': 'ledger',
  '💡': 'spark',
  '📣': 'alarm',
  '📥': 'log',
  '📤': 'log',
  '📦': 'box',
  '🧾': 'ledger',
  '🗓️': 'calendar',
  '🗓': 'calendar',
  '🔖': 'log',
  '🪄': 'spark',
  '🎨': 'party',
  '🖥️': 'server',
  '🖥': 'server',
  '💻': 'server',
  '📱': 'server',
  '🛜': 'online',
  '📶': 'online',
  '🔌': 'lightning',
  '🔋': 'lightning',
  '🧩': 'settings',
  '⚔️': 'shield',
  '⚔': 'shield',
  '🗡️': 'ban',
  '🗡': 'ban',
  '🛑': 'ban',
  '🚀': 'arrow',
  '🎈': 'party',
  '🎊': 'party',
  '🥳': 'party'
};

const emojiFile = path.join(
  __dirname,
  '..',
  '..',
  (config.theme && config.theme.emojiFile) || 'data/emojis.json'
);

let customEmojis = {};

try {
  customEmojis = JSON.parse(fs.readFileSync(emojiFile, 'utf8'));
} catch (err) {
  customEmojis = {};
}

const EMOJI_KEYS = Object.keys(EMOJI_MAP).sort(function (a, b) {
  return b.length - a.length;
});

function emoji(key) {
  const custom = customEmojis[key];
  if (custom && /^<a?:[A-Za-z0-9_]+:\d{5,25}>$/.test(custom)) {
    return custom;
  }

  const configured = config.emojis && config.emojis[key];
  if (configured) return configured;

  return FALLBACK_EMOJIS[key] || '';
}

function parseCustomEmoji(value) {
  if (typeof value !== 'string') return null;

  const match = /^<(a?):([A-Za-z0-9_]+):(\d{5,25})>$/.exec(value);
  if (!match) return null;

  return {
    animated: match[1] === 'a',
    name: match[2],
    id: match[3]
  };
}

function componentEmoji(key) {
  const value = emoji(key);
  return parseCustomEmoji(value) || value;
}

function resolveComponentEmoji(value) {
  if (typeof value === 'string') {
    const key = EMOJI_MAP[value];
    if (key) return componentEmoji(key);

    const parsed = parseCustomEmoji(value);
    if (parsed) return parsed;
  }

  return value;
}

function replaceEmojis(text) {
  if (typeof text !== 'string') return text;

  let result = text;
  for (const source of EMOJI_KEYS) {
    if (result.indexOf(source) !== -1) {
      result = result.split(source).join(emoji(EMOJI_MAP[source]));
    }
  }

  return result;
}

function hexToInt(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const parsed = parseInt(value.replace('#', ''), 16);
  return Number.isNaN(parsed) ? null : parsed;
}

function applyEmbed(data) {
  if (!data || typeof data !== 'object') return data;

  if (data.color === undefined || data.color === null) {
    const color = hexToInt(config.colors && config.colors.primary);
    if (color !== null) data.color = color;
  }

  if (!data.footer || !data.footer.text) {
    data.footer = {
      text: (config.theme && config.theme.footer) ||
        (config.botName + ' • Powered by ' + config.company)
    };
  } else {
    data.footer.text = replaceEmojis(data.footer.text);
  }

  if (data.title) data.title = replaceEmojis(data.title);
  if (data.description) data.description = replaceEmojis(data.description);

  if (data.author && data.author.name) {
    data.author.name = replaceEmojis(data.author.name);
  }

  if (Array.isArray(data.fields)) {
    data.fields.forEach(function (field) {
      if (!field || typeof field !== 'object') return;
      if (field.name) field.name = replaceEmojis(field.name);
      if (field.value) field.value = replaceEmojis(field.value);
    });
  }

  if (!data.timestamp) data.timestamp = new Date().toISOString();

  return data;
}

function patchSetEmoji(Builder) {
  if (!Builder || !Builder.prototype || !Builder.prototype.setEmoji) return;

  const original = Builder.prototype.setEmoji;

  Builder.prototype.setEmoji = function (value) {
    return original.call(this, resolveComponentEmoji(value));
  };
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;

  const originalToJSON = EmbedBuilder.prototype.toJSON;

  EmbedBuilder.prototype.toJSON = function () {
    const data = originalToJSON.call(this);
    return applyEmbed(data);
  };

  patchSetEmoji(ButtonBuilder);
  patchSetEmoji(StringSelectMenuOptionBuilder);
}

module.exports = {
  emoji: emoji,
  componentEmoji: componentEmoji,
  resolveComponentEmoji: resolveComponentEmoji,
  replaceEmojis: replaceEmojis,
  applyEmbed: applyEmbed,
  install: install
};
