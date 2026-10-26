const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const db = require('../database/db');
const config = require('../../config.json');

module.exports = {
  name: 'warn',
  aliases: ['w'],
  description: 'Warns a member in the guild.',
  permissions: [PermissionsBitField.Flags.KickMembers],
  usage: '<user> <reason>',
  async execute(client, message, args) {
    const mentioned = message.mentions.members.first();
    const cleaned = String(args[0] || '').replace(/[<@!#&>]/g, '');
    let target = mentioned || message.guild.members.cache.get(cleaned);

    if (!target && /^\d{15,25}$/.test(cleaned)) {
      target = await message.guild.members.fetch(cleaned).catch(function () {
        return null;
      });
    }

    const reason = args.slice(1).join(' ').trim();

    if (!target) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid member or provide a valid user ID to warn.')]
      });
    }

    if (!reason) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Reason Required', 'Provide a reason for this warning. Example: ' + config.prefix + 'warn @user spamming')]
      });
    }

    if (target.id === message.author.id) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.warning('Self-Warn', 'You cannot warn yourself.')]
      });
    }

    if (target.id === client.user.id) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.warning('Bot-Warn', 'I cannot warn myself.')]
      });
    }

    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot warn someone with an equal or higher role than yourself.')]
      });
    }

    try {
      db.addWarning(message.guild.id, target.id, { reason: reason, moderator: message.author.id });

      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Warn',
        target: target.user,
        moderator: message.author,
        reason: reason
      });

      await message.channel.send({ embeds: [embed] });

      const dm = ZyronEmbedBuilder.warning(
        'You have been warned in ' + message.guild.name,
        'Reason: ' + reason
      );

      target.send({ embeds: [dm] }).catch(function () {
        console.log('Could not DM warn to ' + target.user.tag);
      });

      return true;
    } catch (error) {
      console.error('Warn error:', error);
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Warn Error', 'There was an error trying to warn this user.')]
      });
    }
  }
};
