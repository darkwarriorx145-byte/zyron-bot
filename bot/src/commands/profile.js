const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  return '<t:' + Math.floor(timestamp / 1000) + ':F>';
}

module.exports = {
  name: 'profile',
  aliases: ['userinfo', 'whois', 'me'],
  description: 'Shows a member profile with messages, invites, warnings and server info.',
  usage: '[@user|server]',
  subcommands: [
    { name: '[@user]', description: 'Show a member profile with messages and invites.' },
    { name: 'server', description: 'Show detailed information about this server.' }
  ],
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'server' || sub === 'guild') {
      const guild = message.guild;
      const owner = await guild.fetchOwner().catch(function () {
        return null;
      });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🏠 ' + guild.name)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
              { name: 'Owner', value: owner ? owner.user.tag : '<@' + guild.ownerId + '>', inline: true },
              { name: 'Members', value: String(guild.memberCount), inline: true },
              { name: 'Boosts', value: String(guild.premiumSubscriptionCount || 0) + ' (Tier ' + (guild.premiumTier || 0) + ')', inline: true },
              { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
              { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
              { name: 'Created', value: formatDate(guild.createdTimestamp), inline: true }
            )
            .setFooter({ text: config.botName + ' • Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    let target = message.mentions.users.first();

    if (!target && args[0]) {
      const userId = args[0].replace(/[<@!>]/g, '');
      if (/^\d{15,25}$/.test(userId)) {
        target = await client.users.fetch(userId).catch(function () {
          return null;
        });
      }
    }

    if (!target) target = message.author;

    const member = await message.guild.members.fetch(target.id).catch(function () {
      return null;
    });
    const stats = db.getInviteStats(message.guild.id, target.id);
    const warnings = db.getWarnings(message.guild.id, target.id);
    const messages = db.getMessages(message.guild.id, target.id);
    const color = member && member.displayColor ? member.displayColor : config.colors.primary;

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
          .setTitle('👤 Member Profile')
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'User', value: '<@' + target.id + '>\n' + target.id, inline: true },
            { name: 'Joined', value: member ? formatDate(member.joinedTimestamp) : 'Not in server', inline: true },
            { name: 'Created', value: formatDate(target.createdTimestamp), inline: true },
            { name: 'Top Role', value: member && member.roles.highest ? member.roles.highest.toString() : 'None', inline: true },
            { name: 'Messages', value: String(messages), inline: true },
            { name: 'Warnings', value: String(warnings.length), inline: true },
            {
              name: 'Invites',
              value: '**' + stats.total + '** total\n**' + stats.real + '** real • **' + stats.fake + '** fake\n**' + stats.left + '** left • **' + stats.rejoin + '** rejoin',
              inline: true
            },
            {
              name: 'Server',
              value: '**' + message.guild.name + '**\n' + message.guild.memberCount + ' members • ' + (message.guild.premiumSubscriptionCount || 0) + ' boosts',
              inline: true
            }
          )
          .setFooter({ text: config.botName + ' • Powered by ' + config.company })
          .setTimestamp()
      ]
    });
  }
};
