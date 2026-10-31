const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');
const progression = require('../utils/progression');
const staffTracker = require('../utils/staffTracker');

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
    const community = progression.getProfile(message.guild.id, target.id, message.guild);
    const staff = staffTracker.getStaffMetrics(message.guild.id, target.id);
    const unlockedBadges = community.badges.filter(function (badge) { return badge.unlocked; });
    const badgeText = unlockedBadges.length
      ? unlockedBadges.map(function (badge) { return badge.emoji + ' ' + badge.name; }).join(' • ')
      : 'No badges yet — start chatting and joining voice.';
    const staffText = staff
      ? '**' + (staff.efficiencyScore || 0) + ' pts** • ' + (staff.ticketsClosed || 0) + ' closes • ' + (staff.messages || 0) + ' messages'
      : 'Not tracked as staff';

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
          .setTitle('👤 Member Profile')
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .setDescription('Everything important about **' + target.username + '** in ' + message.guild.name + '.')
          .addFields(
            { name: 'User', value: '<@' + target.id + '>\n' + target.id, inline: true },
            { name: 'Joined', value: member ? formatDate(member.joinedTimestamp) : 'Not in server', inline: true },
            { name: 'Created', value: formatDate(target.createdTimestamp), inline: true },
            { name: 'Top Role', value: member && member.roles.highest ? member.roles.highest.toString() : 'None', inline: true },
            { name: 'Level', value: '**' + community.level + '** • Rank **#' + community.rank + '** of ' + community.totalRanked + '\n' + community.progress + '/' + community.needed + ' XP', inline: true },
            { name: 'Coins', value: '**' + community.coins + '** spendable\n**' + community.coinsEarned + '** earned', inline: true },
            { name: 'Messages', value: String(Math.max(messages, community.messages)), inline: true },
            { name: 'Voice', value: community.voiceMinutes + ' minutes', inline: true },
            { name: 'Warnings', value: String(warnings.length), inline: true },
            {
              name: 'Invites',
              value: '**' + stats.total + '** total\n**' + stats.real + '** real • **' + stats.fake + '** fake\n**' + stats.left + '** left • **' + stats.rejoin + '** rejoin',
              inline: true
            },
            { name: 'Badges', value: '**' + community.badgeCount + '/' + community.totalBadges + '**\n' + badgeText, inline: false },
            { name: 'Streak & Quests', value: '🔥 ' + community.streak + ' day streak\n🎯 ' + community.questsCompleted + ' quests completed', inline: true },
            { name: 'Staff Activity', value: staffText, inline: true },
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
