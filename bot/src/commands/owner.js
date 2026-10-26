const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

const SUBCOMMANDS = [
  { name: 'add <user>', description: 'Add a second owner (co-owner) to the bot.' },
  { name: 'remove <user>', description: 'Remove a co-owner from the bot.' },
  { name: 'list', description: 'Show the main owner and every co-owner.' },
  { name: 'help', description: 'Show this command list.' }
];

function mainOwnerId() {
  return process.env.DEFAULT_OWNER_ID || '';
}

async function resolveUser(client, message, input) {
  if (!input) return null;
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  const cleaned = String(input).replace(/[<@!#&>]/g, '');
  if (!/^\d{15,25}$/.test(cleaned)) return null;
  return client.users.fetch(cleaned).catch(function () {
    return null;
  });
}

module.exports = {
  name: 'owner',
  aliases: ['coowner', 'botowner', 'owners'],
  description: 'Manage bot co-owners. Only the main owner from the .env file can use this.',
  permissions: [],
  ownerOnly: true,
  usage: '<add <user>|remove <user>|list>',
  subcommands: SUBCOMMANDS,
  async execute(client, message, args) {
    const prefix = (db.getGuild(message.guild.id).prefix) || config.prefix;
    const sub = (args[0] || '').toLowerCase();
    const main = mainOwnerId();

    if (message.author.id !== main) {
      return message.reply({
        embeds: [
          ZyronEmbedBuilder.error(
            'Main Owner Only',
            'Only the main bot owner configured in **DEFAULT_OWNER_ID** can manage co-owners.'
          )
        ]
      });
    }

    if (!main) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Owner Not Configured', 'Set **DEFAULT_OWNER_ID** in the .env file first.')]
      });
    }

    if (!sub || sub === 'help' || sub === 'list') {
      const coOwners = db.getCoOwners();
      const lines = coOwners.length
        ? coOwners.map(function (id, index) {
          return (index + 1) + '. <@' + id + '> — **' + id + '**';
        }).join('\n')
        : '*No co-owners yet.*';

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('👑 Bot Ownership')
            .setDescription(
              '**Main Owner (.env):** <@' + main + '>\n' +
              '**Main Owner ID:** **' + main + '**\n\n' +
              '**Co-Owners (' + coOwners.length + '):**\n' + lines + '\n\n' +
              '**' + prefix + 'owner add @user** — add a second owner\n' +
              '**' + prefix + 'owner remove @user** — remove a co-owner\n\n' +
              'Co-owners get owner-level command access and Anti-Nuke trust, but only the main owner can add or remove them.'
            )
            .setFooter({ text: config.botName + ' • Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'add' || sub === 'set') {
      const user = await resolveUser(client, message, args[1]);

      if (!user) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID.')]
        });
      }

      if (user.id === main) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.warning('Already Main Owner', 'That user is already the main owner.')]
        });
      }

      if (user.bot) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Invalid User', 'A bot cannot be a co-owner.')]
        });
      }

      if (db.isCoOwner(user.id)) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.warning('Already Co-Owner', user.tag + ' is already a co-owner.')]
        });
      }

      db.addCoOwner(user.id);

      return message.reply({
        embeds: [
          ZyronEmbedBuilder.success(
            'Co-Owner Added',
            user.tag + ' is now a **second owner** of ' + config.botName + '.\n' +
            'They can use owner commands and are trusted by Anti-Nuke in every server.'
          )
        ]
      });
    }

    if (sub === 'remove' || sub === 'delete' || sub === 'del') {
      const user = await resolveUser(client, message, args[1]);

      if (!user) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Invalid User', 'Mention a user or give a valid user ID.')]
        });
      }

      if (!db.isCoOwner(user.id)) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.warning('Not A Co-Owner', user.tag + ' is not in the co-owner list.')]
        });
      }

      db.removeCoOwner(user.id);

      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Co-Owner Removed', user.tag + ' no longer has bot owner access.')]
      });
    }

    return message.reply({
      embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use **' + prefix + 'owner** to see every option.')]
    });
  }
};
