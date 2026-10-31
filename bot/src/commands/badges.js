const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const progression = require('../utils/progression');

function targetFrom(message, args) {
  return message.mentions.members.first() || (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null) || message.member;
}

module.exports = {
  name: 'badges',
  aliases: ['achievements'],
  description: 'Show community progression badges and the next goals.',
  usage: '[@user]',
  subcommands: [
    { name: '[@user]', description: 'Show a member’s badges and progress.' }
  ],
  async execute(client, message, args) {
    const member = targetFrom(message, args);
    const profile = progression.getProfile(message.guild.id, member.id, message.guild);
    const unlocked = profile.badges.filter(function (badge) { return badge.unlocked; });
    const locked = profile.badges.filter(function (badge) { return !badge.unlocked; }).slice(0, 5);

    const unlockedText = unlocked.length
      ? unlocked.map(function (badge) { return badge.emoji + ' **' + badge.name + '**'; }).join(' • ')
      : 'No badges unlocked yet.';

    const lockedText = locked.length
      ? locked.map(function (badge) {
        return badge.emoji + ' **' + badge.name + '** — ' + badge.description + ' (' + badge.progress + '%)';
      }).join('\n')
      : 'All badges unlocked!';

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
          .setTitle('🏅 Community Badges')
          .setDescription(
            '**Unlocked:** ' + profile.badgeCount + '/' + profile.totalBadges + '\n\n' +
            unlockedText + '\n\n**Next up**\n' + lockedText
          )
          .setFooter({ text: config.botName + ' Progression | Powered by ' + config.company })
          .setTimestamp()
      ]
    });
  }
};
