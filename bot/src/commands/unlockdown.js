const { PermissionsBitField } = require('discord.js');
const db = require('../database/db');
const security = require('../utils/security');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

module.exports = {
  name: 'unlockdown',
  aliases: ['serverunlock'],
  description: 'Unlocks every text channel and restores the previous permissions.',
  permissions: [PermissionsBitField.Flags.Administrator],
  usage: '',
  async execute(client, message) {
    const statusMsg = await message.channel.send({
      embeds: [ZyronEmbedBuilder.warning('Unlocking Server', 'Removing the server lockdown... Please wait.')]
    });

    const result = await security.unlockGuild(message.guild);
    security.endRaidMode(message.guild.id);
    security.clearRecentJoins(message.guild.id);

    if (!result.ok) {
      return statusMsg.edit({
        embeds: [ZyronEmbedBuilder.info('Not Locked', 'There is no active lockdown on this server.')]
      });
    }

    const embed = ZyronEmbedBuilder.base({
      color: config.colors.success,
      title: '🔓 SERVER LOCKDOWN LIFTED',
      description:
        '**Restored Channels:** ' + result.count + '\n' +
        '**Moderator:** ' + message.author.tag + '\n\n' +
        'Previous channel permissions were restored.'
    });

    await statusMsg.edit({ embeds: [embed] });
    await security.alertOwners(client, message.guild, db.getGuild(message.guild.id), embed);

    return true;
  }
};
