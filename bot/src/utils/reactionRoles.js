const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function ensureReactionRoles(guildId) {
  if (!db.data.reactionRoles) db.data.reactionRoles = {};
  if (!Array.isArray(db.data.reactionRoles[guildId])) db.data.reactionRoles[guildId] = [];
}

function addReactionRole(guildId, data) {
  ensureReactionRoles(guildId);
  const rr = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    messageId: data.messageId || null,
    channelId: data.channelId,
    type: data.type || 'button',
    roleId: data.roleId,
    label: data.label,
    emoji: data.emoji || null,
    description: data.description || null,
    maxRoles: data.maxRoles || 0,
    removeOnReact: data.removeOnReact !== false,
    createdBy: data.createdBy || null,
    createdAt: Date.now()
  };
  db.data.reactionRoles[guildId].push(rr);
  db.save();
  return rr;
}

function getReactionRoles(guildId) {
  ensureReactionRoles(guildId);
  return db.data.reactionRoles[guildId];
}

function getReactionRole(guildId, id) {
  return getReactionRoles(guildId).find(r => r.id === id) || null;
}

function deleteReactionRole(guildId, id) {
  const list = getReactionRoles(guildId);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  db.save();
  return true;
}

function buildRolePanel(rr, guild) {
  const role = guild.roles.cache.get(rr.roleId);
  const roleName = role ? role.name : 'Unknown Role';
  const roleColor = role ? role.hexColor : '#5865f2';

  if (rr.type === 'button') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rr:toggle:' + rr.id)
        .setLabel(rr.label || roleName)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(rr.emoji || '🎭')
    );
    const embed = new EmbedBuilder()
      .setColor(roleColor)
      .setTitle(rr.label || ('Role: ' + roleName))
      .setDescription(rr.description || 'Click the button to get/remove the **' + roleName + '** role.')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company });
    return { embeds: [embed], components: [row] };
  }

  if (rr.type === 'dropdown') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('rr:dropdown:' + rr.id)
      .setPlaceholder('Select a role...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(rr.label || roleName)
          .setValue(rr.roleId)
          .setDescription(rr.description || 'Get the ' + roleName + ' role')
          .setEmoji(rr.emoji || '🎭')
      );
    const row = new ActionRowBuilder().addComponents(select);
    const embed = new EmbedBuilder()
      .setColor(roleColor)
      .setTitle(rr.label || ('Role: ' + roleName))
      .setDescription(rr.description || 'Select from the dropdown to get/remove the **' + roleName + '** role.')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company });
    return { embeds: [embed], components: [row] };
  }

  return { embeds: [], components: [] };
}

async function sendReactionRolePanel(channel, rr, guild) {
  const panel = buildRolePanel(rr, guild);
  const msg = await channel.send(panel).catch(() => null);
  if (msg) {
    rr.messageId = msg.id;
    db.save();
  }
  return msg;
}

async function handleReactionRoleToggle(interaction) {
  const parts = interaction.customId.split(':');
  const rrId = parts[2];
  const guildId = interaction.guild.id;
  const rr = getReactionRole(guildId, rrId);
  if (!rr) return interaction.reply({ content: 'Reaction role not found.', ephemeral: true });

  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(rr.roleId);
  if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

  const hasRole = member.roles.cache.has(role.id);
  if (hasRole) {
    await member.roles.remove(role, 'Reaction role removed').catch(() => {});
    return interaction.reply({ content: 'Removed **' + role.name + '** role.', ephemeral: true });
  } else {
    if (rr.maxRoles > 0) {
      const userRoles = member.roles.cache.filter(r => getReactionRoles(guildId).some(rr => rr.roleId === r.id)).size;
      if (userRoles >= rr.maxRoles) {
        return interaction.reply({ content: 'You already have the maximum number of roles from this system.', ephemeral: true });
      }
    }
    await member.roles.add(role, 'Reaction role added').catch(() => {});
    return interaction.reply({ content: 'Added **' + role.name + '** role.', ephemeral: true });
  }
}

async function handleDropdownRole(interaction) {
  const parts = interaction.customId.split(':');
  const rrId = parts[2];
  const guildId = interaction.guild.id;
  const rr = getReactionRole(guildId, rrId);
  if (!rr) return interaction.reply({ content: 'Reaction role not found.', ephemeral: true });

  const selectedRoleId = interaction.values[0];
  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(selectedRoleId);
  if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

  const hasRole = member.roles.cache.has(role.id);
  if (hasRole) {
    await member.roles.remove(role, 'Dropdown role removed').catch(() => {});
    return interaction.reply({ content: 'Removed **' + role.name + '** role.', ephemeral: true });
  } else {
    if (rr.maxRoles > 0) {
      const userRoles = member.roles.cache.filter(r => getReactionRoles(guildId).some(rr => rr.roleId === r.id)).size;
      if (userRoles >= rr.maxRoles) {
        return interaction.reply({ content: 'You already have the maximum number of roles from this system.', ephemeral: true });
      }
    }
    await member.roles.add(role, 'Dropdown role added').catch(() => {});
    return interaction.reply({ content: 'Added **' + role.name + '** role.', ephemeral: true });
  }
}

module.exports = {
  addReactionRole,
  getReactionRoles,
  getReactionRole,
  deleteReactionRole,
  buildRolePanel,
  sendReactionRolePanel,
  handleReactionRoleToggle,
  handleDropdownRole,
  ensureReactionRoles
};