const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');

module.exports = {
  name: 'unban',
  aliases: ['ub'],
  description: 'Unbans a user from the server using their User ID.',
  permissions: [PermissionsBitField.Flags.BanMembers],
  usage: '<userID> [reason]',
  async execute(client, message, args) {
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'No reason provided.';

    if (!userId || isNaN(userId)) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid ID', 'Please provide a valid numeric User ID to unban.')] });
    }

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('User Not Banned', 'This user is not currently banned in this server.')] });
      }

      await message.guild.members.unban(userId, 'Unbanned by ' + message.author.tag + '. Reason: ' + reason);

      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Unban',
        target: banInfo.user,
        moderator: message.author,
        reason: reason
      });

      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Unban Error', 'Failed to unban user. Make sure I have the necessary permissions.')] });
    }
  },
};
