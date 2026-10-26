const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');

module.exports = {
  name: 'untimeout',
  aliases: ['unmute', 'ut'],
  description: 'Removes the timeout / mute from a member.',
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  usage: '<user> [reason]',
  async execute(client, message, args) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(' ') || 'No reason provided.';

    if (!target) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid member or provide a user ID.')] });
    }

    if (!target.isCommunicationDisabled()) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Not Timed Out', 'This member is not currently timed out.')] });
    }

    try {
      await target.timeout(null, 'Untimed out by ' + message.author.tag + '. Reason: ' + reason);

      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Remove Timeout / Unmute',
        target: target.user,
        moderator: message.author,
        reason: reason
      });

      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Untimeout Error', 'Failed to remove timeout from member.')] });
    }
  },
};
