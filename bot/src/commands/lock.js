const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'lock',
  aliases: ['channel-lock'],
  description: 'Locks a channel so @everyone cannot send messages.',
  permissions: [PermissionsBitField.Flags.ManageChannels],
  usage: '[#channel] [reason]',
  async execute(client, message, args) {
    const mentioned = message.mentions.channels.first();
    const channel = mentioned || message.channel;
    const reason = args.slice(mentioned ? 1 : 0).join(' ') || 'No reason provided.';

    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false
      }, { reason: 'Locked by ' + message.author.tag + '. Reason: ' + reason });

      const embed = ZyronEmbedBuilder.base({
        title: '🔒 Channel Locked — #' + channel.name,
        description:
          'This channel has been locked by ' + message.author + '.\n' +
          '**Reason:** ' + reason,
        color: config.colors.danger
      });

      return channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Lock error:', error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Lock Error', 'Failed to lock channel.')] });
    }
  }
};
