const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

const LINK_PATTERN = /https?:\/\/|discord\.gg\/|www\./i;

async function advancedPurge(channel, options, executor) {
  const {
    limit = 100,
    userId,
    bot = false,
    contains,
    links = false,
    invites = false,
    images = false,
    embeds = false,
    attachments = false,
    before,
    after,
    pinned = false
  } = options;

  const messagesToDelete = [];
  let lastId = before || null;
  let fetchedCount = 0;
  const maxFetch = Math.min(limit * 5, 5000);

  while (messagesToDelete.length < limit && fetchedCount < maxFetch) {
    const fetchOptions = { limit: 100 };
    if (lastId) fetchOptions.before = lastId;
    if (after) fetchOptions.after = after;

    const fetched = await channel.messages.fetch(fetchOptions).catch(() => null);
    if (!fetched || fetched.size === 0) break;

    for (const [, msg] of fetched) {
      fetchedCount++;
      lastId = msg.id;

      if (messagesToDelete.length >= limit) break;
      if (pinned && msg.pinned) continue;
      if (userId && msg.author.id !== userId) continue;
      if (bot && !msg.author.bot) continue;
      if (contains && !msg.content.toLowerCase().includes(contains.toLowerCase())) continue;
      if (links && !LINK_PATTERN.test(msg.content)) continue;
      if (invites && !/discord\.gg\/|discordapp\.com\/invite\//i.test(msg.content)) continue;
      if (images && msg.attachments.size === 0 && !msg.content.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)) continue;
      if (embeds && msg.embeds.length === 0) continue;
      if (attachments && msg.attachments.size === 0) continue;

      messagesToDelete.push(msg);
    }

    if (fetched.size < 100) break;
  }

  if (messagesToDelete.length === 0) {
    return { deleted: 0, filtered: fetchedCount, reason: 'No messages matched the criteria.' };
  }

  const deletable = messagesToDelete.filter(m => m.deletable);
  const deleted = await channel.bulkDelete(deletable, true).catch(() => []);
  const deletedCount = deleted.size;

  const logEmbed = new EmbedBuilder()
    .setColor(config.colors.warning)
    .setTitle('🗑️ Advanced Purge Executed')
    .setDescription(
      '**Channel:** ' + channel + '\n' +
      '**Executed by:** ' + executor.tag + ' (<@' + executor.id + '>)\n' +
      '**Messages deleted:** ' + deletedCount + ' / ' + messagesToDelete.length + '\n' +
      '**Filters:** ' + buildFilterString(options)
    )
    .setTimestamp();

  return { deleted: deletedCount, filtered: fetchedCount, logEmbed };
}

function buildFilterString(options) {
  const parts = [];
  if (options.userId) parts.push('User: <@' + options.userId + '>');
  if (options.bot) parts.push('Bots only');
  if (options.contains) parts.push('Contains: "' + options.contains + '"');
  if (options.links) parts.push('Links');
  if (options.invites) parts.push('Invites');
  if (options.images) parts.push('Images');
  if (options.embeds) parts.push('Embeds');
  if (options.attachments) parts.push('Attachments');
  if (options.pinned) parts.push('Exclude pinned');
  return parts.length ? parts.join(', ') : 'None';
}

function parsePurgeArgs(args) {
  const options = { limit: 100 };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--user' && args[i + 1]) {
      options.userId = args[i + 1].replace(/[<@!>]/g, '');
      i += 2;
    } else if (arg === '--bot') {
      options.bot = true;
      i++;
    } else if (arg === '--contains' && args[i + 1]) {
      options.contains = args[i + 1];
      i += 2;
    } else if (arg === '--links') {
      options.links = true;
      i++;
    } else if (arg === '--invites') {
      options.invites = true;
      i++;
    } else if (arg === '--images') {
      options.images = true;
      i++;
    } else if (arg === '--embeds') {
      options.embeds = true;
      i++;
    } else if (arg === '--attachments') {
      options.attachments = true;
      i++;
    } else if (arg === '--before' && args[i + 1]) {
      options.before = args[i + 1];
      i += 2;
    } else if (arg === '--after' && args[i + 1]) {
      options.after = args[i + 1];
      i += 2;
    } else if (arg === '--pinned') {
      options.pinned = true;
      i++;
    } else if (!isNaN(parseInt(arg))) {
      options.limit = Math.min(1000, Math.max(1, parseInt(arg)));
      i++;
    } else {
      i++;
    }
  }
  return options;
}

module.exports = {
  advancedPurge,
  parsePurgeArgs,
  buildFilterString
};