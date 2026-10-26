const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'ban',
  aliases: ['b'],
  description: 'Bans a member from the guild.',
  permissions: [PermissionsBitField.Flags.BanMembers],
  usage: '<user> <reason>',
  async execute(client, message, args) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(' ').trim();

    if (!target) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid member or provide a valid user ID to ban.')] });
    }

    if (!reason) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Reason Required', 'Provide a reason for this ban. Example: ' + config.prefix + 'ban @user raiding')] });
    }

    if (target.id === message.author.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Self-Ban', 'You cannot ban yourself.')] });
    }

    if (target.id === client.user.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Bot-Ban', 'I cannot ban myself.')] });
    }

    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot ban someone with an equal or higher role than yourself.')] });
    }

    if (!target.bannable) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Bot Permission Error', 'I cannot ban this user. Ensure my role is above theirs.')] });
    }

    try {
      await target.ban({ reason: 'Banned by ' + message.author.tag + '. Reason: ' + reason });
      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Ban',
        target: target.user,
        moderator: message.author,
        reason: reason
      });
      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      message.reply({ embeds: [ZyronEmbedBuilder.error('Ban Error', 'There was an error trying to ban this user.')] });
    }
  },
};
