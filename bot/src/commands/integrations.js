const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const integrations = require('../utils/integrations');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

module.exports = {
  name: 'integrations',
  aliases: ['links', 'linked'],
  description: 'Link a Pterodactyl panel, Minecraft server or other services to the dashboard.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<list|types|add|remove|test>',
  subcommands: [
    { name: 'list', description: 'Show every linked integration.' },
    { name: 'types', description: 'Show the 12 supported integration types.' },
    { name: 'add <type> <url> [label]', description: 'Link a service to this server.' },
    { name: 'test <id>', description: 'Test an integration connection.' },
    { name: 'remove <id>', description: 'Remove an integration.' }
  ],

  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'types') {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🔗 Supported Integrations')
          .setDescription(integrations.INTEGRATION_TYPES.map(function (type) {
            return type.icon + ' **' + type.value + '** — ' + type.label;
          }).join('\n'))
          .setFooter({ text: 'Add one with ' + prefix + 'integrations add <type> <url>' })
          .setTimestamp()]
      });
    }

    if (sub === 'list' || !sub) {
      const items = integrations.list(message.guild.id);
      if (items.length === 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('No Integrations', 'Add one from the dashboard or with ' + prefix + 'integrations add pterodactyl https://panel.example.com')] });
      }
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🔗 Linked Integrations')
          .setDescription(items.map(function (item) {
            const type = integrations.typeInfo(item.type);
            const status = item.status === 'online' ? '🟢' : (item.status === 'offline' ? '🔴' : '⚪');
            return status + ' ' + type.icon + ' **' + item.label + '** (`' + item.id + '`)\n' +
              item.url + (item.lastCheckedAt ? ' • checked <t:' + Math.floor(item.lastCheckedAt / 1000) + ':R>' : '');
          }).join('\n\n'))
          .setTimestamp()]
      });
    }

    if (sub === 'add') {
      const type = (args[1] || '').toLowerCase();
      const url = args[2];
      if (!type || !url) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Usage', 'Use ' + prefix + 'integrations add <type> <url> [label]. See ' + prefix + 'integrations types.')] });
      }
      try {
        const item = integrations.add(message.guild.id, {
          type: type,
          url: url,
          label: args.slice(3).join(' ').trim()
        });
        return message.reply({ embeds: [ZyronEmbedBuilder.success('Integration Linked', '**' + item.label + '** is now linked.\nID: `' + item.id + '`')] });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Could Not Link', err.message)] });
      }
    }

    if (sub === 'test') {
      try {
        const item = await integrations.test(message.guild.id, args[1]);
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(item.status === 'online' ? config.colors.success : config.colors.danger)
            .setTitle((item.status === 'online' ? '🟢 Online — ' : '🔴 Offline — ') + item.label)
            .setDescription('**URL:** ' + item.url + '\n**Status:** ' + item.status + (item.lastError ? '\n**Error:** ' + item.lastError : ''))
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Test Failed', err.message)] });
      }
    }

    if (sub === 'remove' || sub === 'delete') {
      const removed = integrations.remove(message.guild.id, args[1]);
      if (!removed) return message.reply({ embeds: [ZyronEmbedBuilder.error('Not Found', 'Use ' + prefix + 'integrations list to see IDs.')] });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Integration Removed', 'The link was deleted.')] });
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'integrations list|types|add|test|remove.')] });
  }
};
