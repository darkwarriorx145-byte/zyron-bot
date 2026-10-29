const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../../src/utils/embedBuilder');
const advancedPurge = require('../utils/advancedPurge');

module.exports = {
  name: 'purge',
  aliases: ['clear', 'clean', 'c'],
  description: 'Deletes messages from the current channel with optional advanced filters.',
  permissions: [PermissionsBitField.Flags.ManageMessages],
  usage: '<amount 1-1000> [--user @user] [--bot] [--contains text] [--links] [--invites] [--images] [--embeds] [--attachments] [--pinned]',
  async execute(client, message, args) {
    const options = advancedPurge.parsePurgeArgs(args || []);
    const hasFilters = options.userId || options.bot || options.contains || options.links ||
      options.invites || options.images || options.embeds || options.attachments || options.pinned;

    if (!hasFilters) {
      const amount = parseInt(args[0]);
      if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Amount', 'Please specify a number between 1 and 100. Add filters like --links or --user @user for advanced purges up to 1000 messages.')] });
      }

      try {
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true);
        const msg = await message.channel.send({
          embeds: [ZyronEmbedBuilder.success('Messages Purged', 'Successfully deleted **' + deleted.size + '** messages.')]
        });
        setTimeout(() => { msg.delete().catch(() => {}); }, 5000);
        return;
      } catch (error) {
        console.error(error);
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Purge Error', 'Could not purge messages. Messages older than 14 days cannot be bulk deleted.')] });
      }
    }

    try {
      await message.delete().catch(() => {});
      const result = await advancedPurge.advancedPurge(message.channel, options, message.author);
      const msg = await message.channel.send({
        embeds: [ZyronEmbedBuilder.success('Advanced Purge Complete', 'Deleted **' + result.deleted + '** messages after scanning **' + result.filtered + '**.\nFilters: ' + advancedPurge.buildFilterString(options))]
      });
      setTimeout(() => { msg.delete().catch(() => {}); }, 6000);
    } catch (error) {
      console.error(error);
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Purge Error', 'Could not complete the advanced purge.')] });
    }
  },
};
