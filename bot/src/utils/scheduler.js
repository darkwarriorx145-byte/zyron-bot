const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const tempActions = require('./tempActions');

let timer = null;

function ensureGuild(guildId) {
  if (!db.data.schedules[guildId]) db.data.schedules[guildId] = [];
  return db.data.schedules[guildId];
}

function parseWhen(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const relative = tempActions.parseDuration(raw);
  if (relative) return { runAt: Date.now() + relative, repeat: 'none' };

  const match = raw.match(/^(\d+[smhdw]):(none|daily|weekly)$/i);
  if (match) {
    const duration = tempActions.parseDuration(match[1]);
    if (!duration) return null;
    return { runAt: Date.now() + duration, repeat: match[2].toLowerCase() };
  }

  const date = new Date(raw);
  if (!isNaN(date.getTime()) && date.getTime() > Date.now()) {
    return { runAt: date.getTime(), repeat: 'none' };
  }

  return null;
}

function addSchedule(guildId, payload) {
  const schedules = ensureGuild(guildId);
  const when = parseWhen(payload.when);
  if (!when) throw new Error('Use a duration like 30m, 2h, 1d or a future date.');
  if (!payload.channelId) throw new Error('A channel is required.');
  if (!payload.message) throw new Error('A message is required.');

  const schedule = {
    id: crypto.randomBytes(6).toString('hex'),
    channelId: String(payload.channelId),
    message: String(payload.message).slice(0, 2000),
    runAt: when.runAt,
    repeat: when.repeat,
    createdBy: String(payload.createdBy || ''),
    createdAt: Date.now(),
    lastRunAt: null
  };
  schedules.push(schedule);
  db.save();
  return schedule;
}

function listSchedules(guildId) {
  return ensureGuild(guildId).slice().sort(function (a, b) { return a.runAt - b.runAt; });
}

function removeSchedule(guildId, scheduleId) {
  const schedules = ensureGuild(guildId);
  const index = schedules.findIndex(function (schedule) { return schedule.id === scheduleId; });
  if (index === -1) return false;
  schedules.splice(index, 1);
  db.save();
  return true;
}

async function processDue(client) {
  if (!client || !client.guilds) return;

  for (const guild of client.guilds.cache.values()) {
    const schedules = ensureGuild(guild.id);
    if (schedules.length === 0) continue;
    const now = Date.now();

    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      if (schedule.runAt > now) continue;

      const channel = guild.channels.cache.get(schedule.channelId);
      if (channel && channel.isTextBased()) {
        channel.send({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📣 Scheduled Announcement')
            .setDescription(schedule.message)
            .setFooter({ text: config.botName + ' Scheduler' })
            .setTimestamp()]
        }).catch(function () {});
      }

      schedule.lastRunAt = Date.now();
      if (schedule.repeat === 'daily') {
        schedule.runAt = now + 24 * 60 * 60 * 1000;
      } else if (schedule.repeat === 'weekly') {
        schedule.runAt = now + 7 * 24 * 60 * 60 * 1000;
      } else {
        schedules.splice(i, 1);
        i--;
      }
    }

    db.save();
  }
}

function start(client) {
  if (timer) return;
  timer = setInterval(function () {
    processDue(client).catch(function (err) {
      console.error('Scheduler failed:', err.message);
    });
  }, 30000);
  if (timer.unref) timer.unref();
}

module.exports = {
  parseWhen,
  addSchedule,
  listSchedules,
  removeSchedule,
  processDue,
  start
};
