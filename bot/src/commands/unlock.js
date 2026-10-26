const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'unlock',
  aliases: ['channel-unlock'],
  description: 'Unlocks a channel allowing @everyone to send messages.',
  permissions: [PermissionsBitField.Flags.ManageChannels],
  usage: '[#channel]',
  async execute(client, message, args) {
    const channel = message.mentions.channels.first() || message.channel;

    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null
      }, { reason: 'Unlocked by ' + message.author.tag });

      const embed = ZyronEmbedBuilder.base({
        title: '🔓 Channel Unlocked — #' + channel.name,
        description: 'This channel has been unlocked by ' + message.author + '. Everyone can chat now.',
        color: config.colors.success
      });

      return channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Unlock error:', error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Unlock Error', 'Failed to unlock channel.')] });
    }
  }
};
