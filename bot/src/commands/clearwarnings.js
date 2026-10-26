const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const db = require('../database/db');

module.exports = {
  name: 'clearwarnings',
  aliases: ['cwarns', 'resetwarns'],
  description: 'Clears all warnings for a member in the guild.',
  permissions: [PermissionsBitField.Flags.Administrator],
  usage: '<user>',
  async execute(client, message, args) {
    const mentioned = message.mentions.users.first();
    const cleaned = String(args[0] || '').replace(/[<@!#&>]/g, '');
    let target = mentioned || client.users.cache.get(cleaned);

    if (!target && /^\d{15,25}$/.test(cleaned)) {
      target = await client.users.fetch(cleaned).catch(function () {
        return null;
      });
    }

    if (!target) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Invalid User', 'Please mention a valid user or provide a valid user ID.')]
      });
    }

    db.clearWarnings(message.guild.id, target.id);

    return message.reply({
      embeds: [ZyronEmbedBuilder.success('Warnings Cleared', 'All warnings for ' + target.tag + ' have been cleared.')]
    });
  }
};
