const {
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../database/db');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

const FEATURES = [
  {
    key: 'antiBan',
    label: 'Anti Ban',
    description: 'Ban members without triggering Anti-Nuke.'
  },
  {
    key: 'antiKick',
    label: 'Anti Kick',
    description: 'Kick members without triggering Anti-Nuke.'
  },
  {
    key: 'antiBotAdd',
    label: 'Anti Bot Add',
    description: 'Add bots without triggering Anti-Nuke.'
  },
  {
    key: 'antiChannelCreate',
    label: 'Anti Channel Create',
    description: 'Create channels without triggering Anti-Nuke.'
  },
  {
    key: 'antiChannelDelete',
    label: 'Anti Channel Delete',
    description: 'Delete channels without triggering Anti-Nuke.'
  },
  {
    key: 'antiChannelUpdate',
    label: 'Anti Channel Update',
    description: 'Edit channels without triggering Anti-Nuke.'
  },
  {
    key: 'antiRoleCreate',
    label: 'Anti Role Create',
    description: 'Create roles without triggering Anti-Nuke.'
  },
  {
    key: 'antiRoleDelete',
    label: 'Anti Role Delete',
    description: 'Delete roles without triggering Anti-Nuke.'
  },
  {
    key: 'antiRoleUpdate',
    label: 'Anti Role Update',
    description: 'Edit roles without triggering Anti-Nuke.'
  },
  {
    key: 'antiWebhook',
    label: 'Anti Webhook',
    description: 'Create or edit webhooks without Anti-Nuke.'
  },
  {
    key: 'antiEveryone',
    label: 'Anti @everyone',
    description: 'Mention @everyone or @here without being muted.'
  },
  {
    key: 'antiGuildUpdate',
    label: 'Anti Guild Update',
    description: 'Change server settings without Anti-Nuke.'
  },
  {
    key: 'antiIntegration',
    label: 'Anti Integration',
    description: 'Manage integrations without Anti-Nuke.'
  },
  {
    key: 'antiMemberUpdate',
    label: 'Anti Member Update',
    description: 'Give dangerous roles without Anti-Nuke.'
  },
  {
    key: 'antiPrune',
    label: 'Anti Prune',
    description: 'Prune members without triggering Anti-Nuke.'
  },
  {
    key: 'antiDangerousPermissionUpdate',
    label: 'Anti Dangerous Permissions',
    description: 'Grant dangerous permissions without Anti-Nuke.'
  },
  {
    key: 'antiSpam',
    label: 'Anti Spam',
    description: 'Send spam without being muted.'
  },
  {
    key: 'antiLink',
    label: 'Anti Link',
    description: 'Post links without being muted.'
  },
  {
    key: 'antiBetrayal',
    label: 'Anti Betrayal',
    description: 'Bypass rogue-staff betrayal detection.'
  },
  {
    key: 'antiAbuse',
    label: 'Anti Abuse',
    description: 'Use profanity without being muted.'
  },
  {
    key: 'antiRaid',
    label: 'Anti Raid',
    description: 'Join during a raid without being kicked or banned.'
  }
];

function getFeature(key) {
  return FEATURES.find(function (item) {
    return item.key === key;
  }) || null;
}

function featureMentions(guildId, key) {
  const list = db.getFeatureWhitelist(guildId, key);
  if (list.length === 0) return 'No users whitelisted for this feature.';

  const lines = list.slice(0, 30).map(function (id, index) {
    return (index + 1) + '. <@' + id + '> — **' + id + '**';
  });

  if (list.length > 30) {
    lines.push('...and ' + (list.length - 30) + ' more user(s).');
  }

  return lines.join('\n');
}

function buildMain(guild) {
  const configured = FEATURES.filter(function (feature) {
    return db.getFeatureWhitelist(guild.id, feature.key).length > 0;
  });

  let summary = 'No per-feature whitelists yet. Pick a protection below to add the first user.';

  if (configured.length > 0) {
    summary = configured.map(function (feature) {
      const count = db.getFeatureWhitelist(guild.id, feature.key).length;
      return '**' + feature.label + '** — ' + count + ' user(s)';
    }).join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎯 Per-Feature Whitelist')
    .setDescription(
      'Whitelist a user for **one specific protection** without making them fully trusted.\n\n' +
      '**How it works**\n' +
      '1. Pick a protection from the dropdown.\n' +
      '2. Select a user to add or remove.\n' +
      '3. That user bypasses **only** that protection.\n\n' +
      '**Global whitelist** still bypasses everything. Per-feature whitelist is safer for staff who only need one permission.\n\n' +
      '**Note:** Native Discord AutoMod rules still apply to everyone. This menu bypasses Zyron punishment only.\n\n' +
      '**Current per-feature whitelists**\n' + summary
    )
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('featurewl:feature')
    .setPlaceholder('Select a protection...')
    .setMinValues(1)
    .setMaxValues(1);

  FEATURES.forEach(function (feature) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(feature.label)
        .setDescription(feature.description)
        .setValue(feature.key)
    );
  });

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

function buildDetail(guild, key, note) {
  const feature = getFeature(key);
  if (!feature) return buildMain(guild);

  const list = db.getFeatureWhitelist(guild.id, key);

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎯 ' + feature.label + ' Whitelist')
    .setDescription(
      'Users below bypass **only ' + feature.label + '**.\n' +
      'They are still protected by every other Anti-Nuke feature.\n\n' +
      '**Whitelisted (' + list.length + ')**\n' +
      featureMentions(guild.id, key) +
      (note ? '\n\n' + note : '')
    )
    .setFooter({ text: config.botName + ' • Per-feature whitelist' })
    .setTimestamp();

  const addMenu = new UserSelectMenuBuilder()
    .setCustomId('featurewl:add:' + key)
    .setPlaceholder('Select user(s) to ADD to ' + feature.label)
    .setMinValues(1)
    .setMaxValues(5);

  const removeMenu = new UserSelectMenuBuilder()
    .setCustomId('featurewl:remove:' + key)
    .setPlaceholder('Select user(s) to REMOVE from ' + feature.label)
    .setMinValues(1)
    .setMaxValues(5);

  const backButton = new ButtonBuilder()
    .setCustomId('featurewl:back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const clearButton = new ButtonBuilder()
    .setCustomId('featurewl:clear:' + key)
    .setLabel('Clear All')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(list.length === 0);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(addMenu),
      new ActionRowBuilder().addComponents(removeMenu),
      new ActionRowBuilder().addComponents(backButton, clearButton)
    ]
  };
}

function buildClearConfirm(guild, key) {
  const feature = getFeature(key);
  if (!feature) return buildMain(guild);

  const count = db.getFeatureWhitelist(guild.id, key).length;

  const embed = new EmbedBuilder()
    .setColor(config.colors.danger)
    .setTitle('⚠️ Clear ' + feature.label + ' Whitelist?')
    .setDescription(
      'This removes **' + count + '** user(s) from the **' + feature.label + '** whitelist.\n\n' +
      'They will be protected by this feature again.'
    )
    .setFooter({ text: config.botName + ' • Per-feature whitelist' })
    .setTimestamp();

  const yesButton = new ButtonBuilder()
    .setCustomId('featurewl:clearyes:' + key)
    .setLabel('Yes, clear it')
    .setStyle(ButtonStyle.Danger);

  const noButton = new ButtonBuilder()
    .setCustomId('featurewl:cancel:' + key)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(yesButton, noButton)]
  };
}

async function deny(interaction) {
  return interaction.reply({
    embeds: [ZyronEmbedBuilder.error('Permission Denied', 'You need the Manage Server permission to use the per-feature whitelist.')],
    ephemeral: true
  }).catch(function () {});
}

module.exports = {
  name: 'featurewl',
  aliases: ['fwl', 'featurewhitelist', 'perfeature'],
  description: 'Whitelist a user for one specific protection with a dropdown menu.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '[feature]',
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Permission Denied', 'You need the Manage Server permission to use the per-feature whitelist.')]
      });
    }

    const wanted = String(args[0] || '').toLowerCase();

    if (wanted) {
      const feature = FEATURES.find(function (item) {
        return item.key.toLowerCase() === wanted || item.label.toLowerCase() === wanted;
      });

      if (feature) {
        return message.channel.send(buildDetail(message.guild, feature.key, null));
      }
    }

    return message.channel.send(buildMain(message.guild));
  },
  async handleInteraction(client, interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        embeds: [ZyronEmbedBuilder.error('Server Only', 'This menu only works inside a server.')],
        ephemeral: true
      }).catch(function () {});
    }

    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return deny(interaction);
    }

    const parts = interaction.customId.split(':');
    const action = parts[1] || '';
    const key = parts[2] || '';

    if (action === 'feature' && interaction.isStringSelectMenu()) {
      const selected = interaction.values[0];
      if (!getFeature(selected)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }
      return interaction.update(buildDetail(interaction.guild, selected, null)).catch(function () {});
    }

    if (action === 'back') {
      return interaction.update(buildMain(interaction.guild)).catch(function () {});
    }

    if (action === 'add' && interaction.isUserSelectMenu()) {
      if (!getFeature(key)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }

      const added = [];
      interaction.values.forEach(function (userId) {
        db.addFeatureWhitelist(interaction.guild.id, key, userId);
        added.push('<@' + userId + '>');
      });

      return interaction.update(
        buildDetail(interaction.guild, key, '✅ Added: ' + added.join(', '))
      ).catch(function () {});
    }

    if (action === 'remove' && interaction.isUserSelectMenu()) {
      if (!getFeature(key)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }

      const removed = [];
      interaction.values.forEach(function (userId) {
        db.removeFeatureWhitelist(interaction.guild.id, key, userId);
        removed.push('<@' + userId + '>');
      });

      return interaction.update(
        buildDetail(interaction.guild, key, '✅ Removed: ' + removed.join(', '))
      ).catch(function () {});
    }

    if (action === 'clear') {
      if (!getFeature(key)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }
      return interaction.update(buildClearConfirm(interaction.guild, key)).catch(function () {});
    }

    if (action === 'clearyes') {
      if (!getFeature(key)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }
      db.clearFeatureWhitelist(interaction.guild.id, key);
      return interaction.update(
        buildDetail(interaction.guild, key, '✅ Whitelist cleared.')
      ).catch(function () {});
    }

    if (action === 'cancel') {
      if (!getFeature(key)) {
        return interaction.update(buildMain(interaction.guild)).catch(function () {});
      }
      return interaction.update(buildDetail(interaction.guild, key, null)).catch(function () {});
    }

    return interaction.reply({
      embeds: [ZyronEmbedBuilder.error('Unknown Action', 'That action is not supported.')],
      ephemeral: true
    }).catch(function () {});
  }
};
