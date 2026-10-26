const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'kick',
  aliases: ['k'],
  description: 'Kicks a member from the guild.',
  permissions: [PermissionsBitField.Flags.KickMembers],
  usage: '<user> <reason>',
  async execute(client, message, args) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(' ').trim();

    if (!target) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid member or provide a valid user ID to kick.')] });
    }

    if (!reason) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Reason Required', 'Provide a reason for this kick. Example: ' + config.prefix + 'kick @user spamming')] });
    }

    if (target.id === message.author.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Self-Kick', 'You cannot kick yourself.')] });
    }

    if (target.id === client.user.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Bot-Kick', 'I cannot kick myself.')] });
    }

    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot kick someone with an equal or higher role than yourself.')] });
    }

    if (!target.kickable) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Bot Permission Error', 'I cannot kick this user. Ensure my role is above theirs.')] });
    }

    try {
      await target.kick('Kicked by ' + message.author.tag + '. Reason: ' + reason);
      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Kick',
        target: target.user,
        moderator: message.author,
        reason: reason
      });
      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      message.reply({ embeds: [ZyronEmbedBuilder.error('Kick Error', 'There was an error trying to kick this user.')] });
    }
  },
};
