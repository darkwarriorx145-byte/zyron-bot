const { PermissionsBitField } = require('discord.js');
const db = require('../database/db');
const security = require('../utils/security');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'lockdown',
  aliases: ['serverlock'],
  description: 'Locks every text channel in the server and alerts the owners.',
  permissions: [PermissionsBitField.Flags.Administrator],
  usage: '[reason]',
  async execute(client, message, args) {
    const reason = args.join(' ') || 'Manual emergency lockdown by ' + message.author.tag;

    const statusMsg = await message.channel.send({
      embeds: [ZyronEmbedBuilder.warning('Lockdown Initiated', 'Locking every text channel... Please wait.')]
    });

    const result = await security.lockGuild(message.guild, reason);

    if (!result.ok && result.already) {
      return statusMsg.edit({
        embeds: [ZyronEmbedBuilder.warning('Already Locked', 'The server is already in lockdown. Use **' + (db.getGuild(message.guild.id).prefix || config.prefix) + 'unlockdown** to lift it.')]
      });
    }

    const embed = ZyronEmbedBuilder.base({
      color: config.colors.danger,
      title: '🚨 SERVER LOCKDOWN ACTIVE',
      description:
        '**Locked Channels:** ' + result.count + ' / ' + result.total + '\n' +
        '**Reason:** ' + reason + '\n' +
        '**Moderator:** ' + message.author.tag
    });

    await statusMsg.edit({ embeds: [embed] });
    await security.alertOwners(client, message.guild, db.getGuild(message.guild.id), embed);

    return true;
  }
};
