const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');

let timer = null;

function parseDuration(input) {
  const match = String(input || '').trim().match(/^(\d+)\s*([smhdw])$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days) parts.push(days + 'd');
  if (hours) parts.push(hours + 'h');
  if (minutes) parts.push(minutes + 'm');
  if (seconds && parts.length === 0) parts.push(seconds + 's');
  return parts.join(' ') || '0s';
}

function ensureGuild(guildId) {
  if (!db.data.tempActions[guildId]) db.data.tempActions[guildId] = [];
  return db.data.tempActions[guildId];
}

function addAction(guildId, payload) {
  const actions = ensureGuild(guildId);
  const action = {
    id: require('crypto').randomBytes(6).toString('hex'),
    type: String(payload.type || '').toLowerCase(),
    userId: String(payload.userId || ''),
    moderatorId: String(payload.moderatorId || ''),
    reason: String(payload.reason || 'No reason provided').slice(0, 500),
    createdAt: Date.now(),
    expiresAt: Number(payload.expiresAt || 0)
  };
  if (['ban', 'timeout', 'kick'].indexOf(action.type) === -1) {
    throw new Error('Temp action type must be ban, timeout or kick.');
  }
  if (!action.userId || !action.expiresAt) throw new Error('A user and expiry are required.');
  actions.push(action);
  db.save();
  return action;
}

function listActions(guildId) {
  return ensureGuild(guildId).slice().sort(function (a, b) {
    return a.expiresAt - b.expiresAt;
  });
}

function removeAction(guildId, actionId) {
  const actions = ensureGuild(guildId);
  const index = actions.findIndex(function (action) { return action.id === actionId; });
  if (index === -1) return false;
  actions.splice(index, 1);
  db.save();
  return true;
}

async function logExpiry(guild, settings, action, ok, detail) {
  const logId = settings.logChannel;
  const channel = logId ? guild.channels.cache.get(logId) : null;
  if (!channel) return;
  channel.send({
    embeds: [new EmbedBuilder()
      .setColor(ok ? config.colors.success : config.colors.warning)
      .setTitle(ok ? '⏰ Temp Action Expired' : '⚠️ Temp Action Expiry Failed')
      .setDescription(
        '**Type:** ' + action.type + '\n' +
        '**User:** <@' + action.userId + '> (' + action.userId + ')\n' +
        '**Reason:** ' + action.reason + '\n' +
        (detail ? '**Result:** ' + detail : '')
      )
      .setFooter({ text: config.botName + ' Scheduled Moderation' })
      .setTimestamp()]
  }).catch(function () {});
}

async function processExpired(client) {
  if (!client || !client.guilds) return;

  for (const guild of client.guilds.cache.values()) {
    const actions = ensureGuild(guild.id);
    if (actions.length === 0) continue;
    const settings = db.getGuild(guild.id);
    const now = Date.now();

    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action.expiresAt > now) continue;

      let ok = false;
      let detail = '';

      try {
        if (action.type === 'ban') {
          await guild.bans.remove(action.userId, 'Temporary ban expired');
          ok = true;
          detail = 'Ban removed automatically.';
        } else if (action.type === 'timeout') {
          const member = await guild.members.fetch(action.userId).catch(function () { return null; });
          if (member) {
            await member.timeout(null, 'Temporary timeout expired');
            ok = true;
            detail = 'Timeout removed automatically.';
          } else {
            ok = true;
            detail = 'Member is no longer in the server.';
          }
        } else if (action.type === 'kick') {
          const member = await guild.members.fetch(action.userId).catch(function () { return null; });
          if (member && member.kickable) {
            await member.kick('Scheduled temporary kick: ' + action.reason);
            ok = true;
            detail = 'Scheduled kick executed.';
          } else {
            ok = true;
            detail = 'Member is no longer in the server or cannot be kicked.';
          }
        }
      } catch (err) {
        detail = err.message;
      }

      actions.splice(i, 1);
      db.save();
      await logExpiry(guild, settings, action, ok, detail);
    }
  }
}

function start(client) {
  if (timer) return;
  timer = setInterval(function () {
    processExpired(client).catch(function (err) {
      console.error('Temp action processing failed:', err.message);
    });
  }, 30000);
  if (timer.unref) timer.unref();
}

module.exports = {
  parseDuration,
  formatDuration,
  addAction,
  listActions,
  removeAction,
  processExpired,
  start
};
