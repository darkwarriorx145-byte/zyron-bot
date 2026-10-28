const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const config = require('../../config.json');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

const GROUPS = [
  {
    name: 'General',
    keys: ['success', 'error', 'warning', 'info', 'shield', 'user', 'added_by', 'mention', 'id', 'expiry', 'star']
  },
  {
    name: 'Security & Moderation',
    keys: ['ban', 'kick', 'mute', 'warn', 'purge', 'lock', 'unlock', 'online', 'offline', 'disabled', 'settings', 'backup', 'ai', 'lightning']
  },
  {
    name: 'Utility',
    keys: ['role', 'owner', 'log', 'log_alt', 'link', 'link_alt', 'trash', 'alarm', 'server', 'whitelist', 'channel', 'box', 'box_alt']
  },
  {
    name: 'Community & Economy',
    keys: ['crown', 'party', 'economy', 'coin', 'ticket', 'giveaway', 'poll', 'invites', 'id_card', 'help', 'ledger']
  },
  {
    name: 'Navigation & Status',
    keys: ['back', 'search', 'clock', 'calendar', 'final_check', 'final_cross', 'arrow', 'loading', 'enabled', 'emergency', 'raid', 'nuke', 'profile', 'check', 'cross']
  }
];

function iconRow(keys) {
  return keys.map(function (key) {
    return ZyronEmbedBuilder.emoji(key);
  }).join(' ');
}

module.exports = {
  name: 'theme',
  aliases: ['style', 'preview'],
  description: 'Preview the Zyron message theme and custom emoji set.',
  usage: '',
  ownerOnly: true,
  async execute(client, message) {
    const target = message.mentions.users.first() || message.author;

    const gallery = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setAuthor({
        name: config.botName + ' • Theme Preview',
        iconURL: client.user.displayAvatarURL()
      })
      .setTitle(ZyronEmbedBuilder.emoji('shield') + ' ' + config.botName + ' Custom Emoji Set')
      .setDescription(
        'All icons below are real Discord application emojis uploaded to Zyron.\n' +
        'Embeds, buttons and select menus use them automatically.'
      )
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({
        text: config.botName + ' • Powered by ' + config.company,
        iconURL: client.user.displayAvatarURL()
      })
      .setTimestamp();

    for (let i = 0; i < GROUPS.length; i++) {
      gallery.addFields({
        name: GROUPS[i].name,
        value: iconRow(GROUPS[i].keys),
        inline: false
      });
    }

    const accessGrant = ZyronEmbedBuilder.accessGrant({
      target: target,
      moderator: message.author,
      expiry: 'Never',
      timestamp: new Date(),
      authorName: config.botName,
      authorIcon: client.user.displayAvatarURL(),
      thumbnail: client.user.displayAvatarURL()
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Invite Zyron')
        .setEmoji(ZyronEmbedBuilder.emoji('link'))
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.gg/NptArpkjK'),
      new ButtonBuilder()
        .setLabel('Dashboard')
        .setEmoji(ZyronEmbedBuilder.emoji('server'))
        .setStyle(ButtonStyle.Link)
        .setURL('https://zyron-manage.netlify.app')
    );

    return message.reply({
      embeds: [gallery, accessGrant],
      components: [row]
    });
  }
};
