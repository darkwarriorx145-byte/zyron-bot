const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const progression = require('../utils/progression');

function bar(progress, goal) {
  const width = 10;
  const ratio = goal > 0 ? Math.min(1, progress / goal) : 0;
  const filled = Math.round(ratio * width);
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

module.exports = {
  name: 'quests',
  aliases: ['quest'],
  description: 'Show daily and weekly community quest progress.',
  usage: '[@user]',
  subcommands: [
    { name: '[@user]', description: 'Show quest progress for a member.' }
  ],
  async execute(client, message, args) {
    const member = message.mentions.members.first() ||
      (args[0] ? message.guild.members.cache.get(args[0].replace(/[<@!>]/g, '')) : null) ||
      message.member;
    const profile = progression.getProfile(message.guild.id, member.id, message.guild);

    if (!profile.questsEnabled) {
      return message.reply('Quests are not enabled on this server yet. An admin can enable them in the dashboard.');
    }

    const lines = profile.quests.map(function (quest) {
      return '**' + (quest.period === 'daily' ? 'Daily' : 'Weekly') + ' — ' + quest.label + '**\n' +
        bar(quest.progress, quest.goal) + ' ' + quest.progress + '/' + quest.goal +
        ' • ' + (quest.completed ? '✅ Completed' : '🎁 ' + quest.reward + ' coins');
    });

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
          .setTitle('🎯 Community Quests')
          .setDescription(lines.join('\n\n').slice(0, 4000))
          .setFooter({ text: config.botName + ' Progression | Powered by ' + config.company })
          .setTimestamp()
      ]
    });
  }
};
