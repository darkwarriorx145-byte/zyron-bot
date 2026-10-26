const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');

module.exports = {
  name: 'purge',
  aliases: ['clear', 'clean', 'c'],
  description: 'Deletes a specified amount of messages from the current channel.',
  permissions: [PermissionsBitField.Flags.ManageMessages],
  usage: '<amount 1-100>',
  async execute(client, message, args) {
    const amount = parseInt(args[0]);

    if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Amount', 'Please specify a valid number of messages to purge between 1 and 100.')] });
    }

    try {
      await message.delete().catch(() => {});

      const deleted = await message.channel.bulkDelete(amount, true);

      const msg = await message.channel.send({
        embeds: [ZyronEmbedBuilder.success('Messages Purged', 'Successfully deleted **' + deleted.size + '** messages.')]
      });

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 5000);

    } catch (error) {
      console.error(error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Purge Error', 'Could not purge messages. Messages older than 14 days cannot be bulk deleted.')] });
    }
  },
};
