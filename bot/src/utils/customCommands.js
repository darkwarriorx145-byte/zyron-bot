const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function ensureCustomCommands(guildId) {
  if (!db.data.customCommands) db.data.customCommands = {};
  if (!Array.isArray(db.data.customCommands[guildId])) db.data.customCommands[guildId] = [];
}

function addCustomCommand(guildId, commandData) {
  ensureCustomCommands(guildId);
  const cmd = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    name: commandData.name.toLowerCase().trim(),
    response: commandData.response,
    type: commandData.type || 'text',
    embed: commandData.embed || null,
    cooldown: Math.max(0, parseInt(commandData.cooldown, 10)) || 0,
    allowedRoles: Array.isArray(commandData.allowedRoles) ? commandData.allowedRoles.filter(r => /^\d{15,25}$/.test(r)) : [],
    allowedChannels: Array.isArray(commandData.allowedChannels) ? commandData.allowedChannels.filter(c => /^\d{15,25}$/.test(c)) : [],
    createdBy: commandData.createdBy || null,
    createdAt: Date.now(),
    uses: 0
  };
  db.data.customCommands[guildId].push(cmd);
  db.save();
  return cmd;
}

function getCustomCommands(guildId) {
  ensureCustomCommands(guildId);
  return db.data.customCommands[guildId];
}

function getCustomCommand(guildId, name) {
  const cmds = getCustomCommands(guildId);
  return cmds.find(c => c.name === name.toLowerCase().trim()) || null;
}

function updateCustomCommand(guildId, id, updates) {
  const cmds = getCustomCommands(guildId);
  const idx = cmds.findIndex(c => c.id === id);
  if (idx === -1) return null;
  Object.assign(cmds[idx], updates);
  db.save();
  return cmds[idx];
}

function deleteCustomCommand(guildId, id) {
  const cmds = getCustomCommands(guildId);
  const idx = cmds.findIndex(c => c.id === id);
  if (idx === -1) return false;
  cmds.splice(idx, 1);
  db.save();
  return true;
}

function canUseCommand(member, cmd, channelId) {
  if (cmd.allowedRoles.length > 0 && !member.roles.cache.some(r => cmd.allowedRoles.includes(r.id))) return false;
  if (cmd.allowedChannels.length > 0) {
    const current = channelId || (member && member.channel ? member.channel.id : null);
    if (!current || !cmd.allowedChannels.includes(current)) return false;
  }
  return true;
}

function buildCommandEmbed(cmd) {
  if (!cmd.embed) return null;
  const e = cmd.embed;
  const embed = new EmbedBuilder()
    .setColor(e.color || config.colors.primary)
    .setTitle(e.title || null)
    .setDescription(e.description || null)
    .setFooter({ text: e.footer || (config.botName + ' | Powered by ' + config.company) })
    .setTimestamp();
  if (e.image) embed.setImage(e.image);
  if (e.thumbnail) embed.setThumbnail(e.thumbnail);
  if (e.author) embed.setAuthor({ name: e.author.name, iconURL: e.author.icon, url: e.author.url });
  if (e.fields && Array.isArray(e.fields)) {
    e.fields.forEach(f => embed.addFields({ name: f.name, value: f.value, inline: f.inline }));
  }
  return embed;
}

async function executeCustomCommand(message, cmd) {
  if (cmd.cooldown > 0) {
    const key = 'ccmd:' + message.guild.id + ':' + message.author.id + ':' + cmd.id;
    // Simple in-memory cooldown (could persist to DB)
    if (global.customCmdCooldowns && global.customCmdCooldowns.has(key)) {
      return message.reply({ content: 'This command is on cooldown.' }).catch(() => {});
    }
    if (!global.customCmdCooldowns) global.customCmdCooldowns = new Map();
    global.customCmdCooldowns.set(key, true);
    setTimeout(() => global.customCmdCooldowns.delete(key), cmd.cooldown * 1000);
  }

  cmd.uses++;
  db.save();

  if (cmd.type === 'embed' && cmd.embed) {
    const embed = buildCommandEmbed(cmd);
    if (embed) return message.reply({ embeds: [embed] }).catch(() => {});
  }
  return message.reply({ content: cmd.response.slice(0, 2000) }).catch(() => {});
}

module.exports = {
  addCustomCommand,
  getCustomCommands,
  getCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
  canUseCommand,
  buildCommandEmbed,
  executeCustomCommand
};