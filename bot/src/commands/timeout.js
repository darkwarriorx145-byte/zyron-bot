const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');
const config = require('../../config.json');

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)([s|m|h|d|w])$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    case 'w': return val * 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

module.exports = {
  name: 'timeout',
  aliases: ['mute', 'tempmute', 't'],
  description: 'Times out / mutes a member for a specified duration.',
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  usage: '<user> <duration e.g. 10m/1h/1d> <reason>',
  async execute(client, message, args) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const durationInput = args[1];
    const reason = args.slice(2).join(' ').trim();

    if (!target) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid member or provide a user ID.')] });
    }

    if (!durationInput) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Duration', 'Please specify a duration (e.g., 10m, 1h, 1d).')] });
    }

    const durationMs = parseDuration(durationInput);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Duration', 'Duration must be between 5 seconds and 28 days (e.g. 10m, 2h, 7d).')] });
    }

    if (!reason) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Reason Required', 'Provide a reason for this timeout. Example: ' + config.prefix + 'timeout @user 10m spamming')] });
    }

    if (target.id === message.author.id) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Self Timeout', 'You cannot timeout yourself.')] });
    }

    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot timeout a user with equal or higher role hierarchy.')] });
    }

    if (!target.moderatable) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'I cannot timeout this user.')] });
    }

    try {
      await target.timeout(durationMs, 'Timed out by ' + message.author.tag + '. Reason: ' + reason);

      const embed = ZyronEmbedBuilder.moderationAction({
        action: 'Timeout / Mute',
        target: target.user,
        moderator: message.author,
        reason: reason,
        duration: durationInput
      });

      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Timeout Error', 'Failed to timeout member.')] });
    }
  },
};
