const { PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const channelBackup = require('../utils/channelBackup');
const config = require('../../config.json');

const FEATURES = [
  { key: 'antiBan', label: 'Anti Ban' },
  { key: 'antiKick', label: 'Anti Kick' },
  { key: 'antiBotAdd', label: 'Anti Bot Add' },
  { key: 'antiChannelCreate', label: 'Anti Channel Create' },
  { key: 'antiChannelDelete', label: 'Anti Channel Delete' },
  { key: 'antiChannelUpdate', label: 'Anti Channel Update' },
  { key: 'antiRoleCreate', label: 'Anti Role Create' },
  { key: 'antiRoleDelete', label: 'Anti Role Delete' },
  { key: 'antiRoleUpdate', label: 'Anti Role Update' },
  { key: 'antiWebhook', label: 'Anti Webhook' },
  { key: 'antiEveryone', label: 'Anti @everyone / @here' },
  { key: 'antiGuildUpdate', label: 'Anti Guild Update' },
  { key: 'antiIntegration', label: 'Anti Integration' },
  { key: 'antiMemberUpdate', label: 'Anti Member Update' },
  { key: 'antiPrune', label: 'Anti Prune' },
  { key: 'antiDangerousPermissionUpdate', label: 'Anti Dangerous Permission Update' },
  { key: 'antiSpam', label: 'Anti Spam' },
  { key: 'antiLink', label: 'Anti Link' },
  { key: 'antiChannelRecovery', label: 'Anti Channel Recovery' },
  { key: 'antiBetrayal', label: 'Anti Betrayal (rogue owner/staff)' },
  { key: 'antiAbuse', label: 'Anti Abuse (EN + Hindi profanity)' },
  { key: 'antiRaid', label: 'Anti Raid (mass joins)' },
  { key: 'autoLockdown', label: 'Auto Lockdown' },
  { key: 'autoMod', label: 'Discord AutoMod Integration' }
];

const SUBCOMMANDS = [
  { name: 'settings', description: 'View the live Anti-Nuke protection matrix.' },
  { name: 'enable', description: 'Arm the whole Anti-Nuke system.' },
  { name: 'disable', description: 'Disarm the whole Anti-Nuke system.' },
  { name: 'whitelist <user>', description: 'Trust a user so their actions are ignored.' },
  { name: 'unwhitelist <user>', description: 'Remove a user from the trusted list.' },
  { name: 'whitelisted', description: 'List every whitelisted user.' },
  { name: 'toggle <feature>', description: 'Turn one protection on or off.' },
  { name: 'features', description: 'List every feature key you can toggle.' },
  { name: 'punishment <ban|kick|mute>', description: 'Set the punishment for nukers.' },
  { name: 'setlogs <#channel>', description: 'Choose the security log channel.' },
  { name: 'createlogs', description: 'Create a private zyron-logs channel now.' },
  { name: 'backup', description: 'Save a snapshot of every channel right now.' },
  { name: 'recover', description: 'Restore every deleted or nuked channel from backups.' },
  { name: 'extraowner <user>', description: 'Add a trusted extra owner.' },
  { name: 'remowner <user>', description: 'Remove an extra owner.' },
  { name: 'reset', description: 'Reset all protections to defaults.' }
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getPrefix(message) {
  const settings = db.getGuild(message.guild.id);
  return settings.prefix || config.prefix;
}

async function resolveUser(client, message, input) {
  if (!input) return null;
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  const cleaned = String(input).replace(/[<@!#&>]/g, '');
  if (!/^\d{15,25}$/.test(cleaned)) return null;
  const user = await client.users.fetch(cleaned).catch(function () { return null; });
  return user;
}

function resolveChannel(message, input) {
  if (!input) return null;
  const mentioned = message.mentions.channels.first();
  if (mentioned) return mentioned;
  const cleaned = String(input).replace(/[<#>]/g, '');
  if (!/^\d{15,25}$/.test(cleaned)) return null;
  return message.guild.channels.cache.get(cleaned) || null;
}

async function createLogChannel(guild) {
  const existing = guild.channels.cache.find(function (channel) {
    return channel.name === 'zyron-logs' && channel.type === ChannelType.GuildText;
  });

  if (existing) {
    db.updateGuild(guild.id, { logChannel: existing.id });
    return existing;
  }

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return null;

  const channel = await guild.channels.create({
    name: 'zyron-logs',
    type: ChannelType.GuildText,
    topic: 'Zyron security & moderation logs. Powered by ' + config.company,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ],
    reason: 'Zyron: private security log channel.'
  }).catch(function () { return null; });

  if (channel) db.updateGuild(guild.id, { logChannel: channel.id });
  return channel;
}

module.exports = {
  name: 'antinuke',
  aliases: ['an', 'antiraid', 'security'],
  description: 'Manages the Anti-Nuke security system and every protection.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<subcommand>',
  ownerOnly: false,
  subcommands: SUBCOMMANDS,
  async execute(client, message, args) {
    const guildId = message.guild.id;
    const settings = db.getGuild(guildId);
    const prefix = getPrefix(message);
    const sub = normalize(args[0]);
    const isBotOwner = message.author.id === process.env.DEFAULT_OWNER_ID || db.isCoOwner(message.author.id);
    const isGuildOwner = message.author.id === message.guild.ownerId;
    const isExtraOwner = settings.extraOwners.indexOf(message.author.id) !== -1;
    const canConfigure = isBotOwner || isGuildOwner || isExtraOwner;

    const viewOnly = sub === '' || sub === 'help' || sub === 'view' || sub === 'settings' || sub === 'overview' || sub === 'status' || sub === 'whitelisted' || sub === 'list' || sub === 'features';

    if (!canConfigure && !viewOnly) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Permission Denied', 'Only the server owner, bot owner or an extra owner can change Anti-Nuke settings.')]
      });
    }

    if (sub === '' || sub === 'help') {
      const fields = SUBCOMMANDS.map(function (item) {
        return {
          name: prefix + 'antinuke ' + item.name,
          value: item.description,
          inline: false
        };
      });

      fields.push({
        name: prefix + 'featurewl',
        value: 'Open the dropdown to whitelist a user for one specific protection.',
        inline: false
      });

      return message.channel.send({
        embeds: [
          ZyronEmbedBuilder.base({
            title: '🛡️ Anti-Nuke & Security Help',
            description: 'Manage ' + config.botName + ' Anti-Nuke and protect your server from every destructive action.',
            fields: fields
          })
        ]
      });
    }

    if (sub === 'settings' || sub === 'overview' || sub === 'status' || sub === 'view') {
      return message.channel.send({ embeds: [ZyronEmbedBuilder.antinukeOverview(message.guild, settings)] });
    }

    if (sub === 'enable') {
      db.updateGuild(guildId, { antiNukeEnabled: true });
      const logChannel = settings.logChannel ? message.guild.channels.cache.get(settings.logChannel) : null;
      if (!logChannel) await createLogChannel(message.guild);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti-Nuke Enabled', 'All guards are armed and every violation is now punished and logged.')]
      });
    }

    if (sub === 'disable') {
      db.updateGuild(guildId, { antiNukeEnabled: false });
      return message.reply({
        embeds: [ZyronEmbedBuilder.warning('Anti-Nuke Disabled', 'The system is now disarmed. Your server is unprotected.')]
      });
    }

    if (sub === 'whitelist' || sub === 'wl' || sub === 'trust' || sub === 'add') {
      const user = await resolveUser(client, message, args[1]);
      if (!user) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID to whitelist.')] });
      }
      db.addWhitelist(guildId, user.id);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('User Whitelisted', user.tag + ' is now trusted and immune to Anti-Nuke.')] });
    }

    if (sub === 'unwhitelist' || sub === 'unwl' || sub === 'untrust' || sub === 'remove') {
      const user = await resolveUser(client, message, args[1]);
      if (!user) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID to unwhitelist.')] });
      }
      db.removeWhitelist(guildId, user.id);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('User Unwhitelisted', user.tag + ' is no longer trusted.')] });
    }

    if (sub === 'whitelisted' || sub === 'list') {
      if (settings.whitelist.length === 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('Whitelist Empty', 'No users are whitelisted yet. Use ' + prefix + 'antinuke whitelist @user')] });
      }
      const lines = settings.whitelist.map(function (id, index) {
        return (index + 1) + '. <@' + id + '> — **' + id + '**';
      });
      return message.channel.send({
        embeds: [
          ZyronEmbedBuilder.base({
            title: '📋 Whitelisted Users (' + settings.whitelist.length + ')',
            description: lines.join('\n')
          })
        ]
      });
    }

    if (sub === 'features') {
      const lines = FEATURES.map(function (feature) {
        const state = settings.features[feature.key] ? '🟢 ON' : '🔴 OFF';
        return state + ' — **' + feature.label + '** (key: **' + feature.key + '**)';
      });
      return message.channel.send({
        embeds: [
          ZyronEmbedBuilder.base({
            title: '⚙️ Anti-Nuke Features',
            description: lines.join('\n') + '\n\nToggle with: ' + prefix + 'antinuke toggle <feature>'
          })
        ]
      });
    }

    if (sub === 'toggle') {
      const wanted = normalize(args[1]);
      if (!wanted) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Feature', 'Use ' + prefix + 'antinuke toggle <feature> — see ' + prefix + 'antinuke features.')] });
      }

      const feature = FEATURES.find(function (item) {
        return normalize(item.key) === wanted || normalize(item.label) === wanted;
      });

      if (!feature) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Feature', 'That feature does not exist. Use ' + prefix + 'antinuke features.')] });
      }

      const next = !settings.features[feature.key];
      db.setFeature(guildId, feature.key, next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Feature Updated', feature.label + ' is now ' + (next ? '🟢 ON' : '🔴 OFF') + '.')]
      });
    }

    if (sub === 'punishment' || sub === 'punish') {
      const choice = normalize(args[1]);
      const valid = ['ban', 'kick', 'mute'];
      if (valid.indexOf(choice) === -1) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Punishment', 'Choose one of: ban, kick, mute.')] });
      }
      db.updateGuild(guildId, { punishment: choice });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Punishment Set', 'Nukers will now be punished with **' + choice.toUpperCase() + '**.')] });
    }

    if (sub === 'setlogs' || sub === 'logchannel' || sub === 'logs') {
      const channel = resolveChannel(message, args[1]);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Channel', 'Mention a text channel or give a valid channel ID.')] });
      }
      db.updateGuild(guildId, { logChannel: channel.id });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Log Channel Set', 'Security alerts will be sent to ' + channel + '.')] });
    }

    if (sub === 'createlogs') {
      const channel = await createLogChannel(message.guild);
      if (!channel) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Could Not Create Channel', 'I need the Manage Channels permission.')] });
      }
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Log Channel Ready', 'Created ' + channel + ' and saved it as the security log channel.')] });
    }

    if (sub === 'extraowner' || sub === 'addowner') {
      const user = await resolveUser(client, message, args[1]);
      if (!user) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID.')] });
      }
      db.addExtraOwner(guildId, user.id);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Extra Owner Added', user.tag + ' can now manage Anti-Nuke and bypass it.')] });
    }

    if (sub === 'remowner' || sub === 'removeowner') {
      const user = await resolveUser(client, message, args[1]);
      if (!user) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID.')] });
      }
      db.removeExtraOwner(guildId, user.id);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Extra Owner Removed', user.tag + ' is no longer an extra owner.')] });
    }

    if (sub === 'backup') {
      channelBackup.backupGuild(message.guild);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Backup Saved', 'A snapshot of every channel was saved. Use ' + prefix + 'antinuke recover to restore deleted channels.')] });
    }

    if (sub === 'recover') {
      const restored = await channelBackup.recoverGuild(message.guild);
      if (restored === 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('Nothing To Recover', 'Every backed up channel still exists on the server.')] });
      }
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Channels Recovered', 'Restored **' + restored + '** channel(s) from the Anti-Nuke backup.')] });
    }

    if (sub === 'reset') {
      db.updateGuild(guildId, {
        antiNukeEnabled: config.defaultSettings.antiNukeEnabled,
        punishment: config.defaultSettings.punishment,
        features: Object.assign({}, config.defaultSettings.features)
      });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Anti-Nuke Reset', 'Every protection is back to its default state.')] });
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'antinuke to see every subcommand.')] });
  }
};
