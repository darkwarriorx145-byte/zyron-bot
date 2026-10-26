const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const db = require('../database/db');
const config = require('../../config.json');

module.exports = {
  name: 'warnings',
  aliases: ['warns'],
  description: 'Shows all warnings for a member.',
  permissions: [PermissionsBitField.Flags.KickMembers],
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

    const warnings = db.getWarnings(message.guild.id, target.id);

    if (warnings.length === 0) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('No Warnings', target.tag + ' has no warnings in this server.')]
      });
    }

    const fields = warnings.map(function (warn, index) {
      return {
        name: 'Warning ' + (index + 1) + ' (ID: ' + warn.id + ')',
        value:
          '**Reason:** ' + warn.reason + '\n' +
          '**Moderator:** <@' + (warn.moderator || '0') + '>\n' +
          '**Date:** ' + new Date(warn.timestamp).toLocaleString(),
        inline: false
      };
    });

    const warningsEmbed = ZyronEmbedBuilder.base({
      title: config.emojis.warning + ' Warnings for ' + target.tag,
      description: 'Total warnings: **' + warnings.length + '**',
      fields: fields
    });

    return message.channel.send({ embeds: [warningsEmbed] });
  }
};
