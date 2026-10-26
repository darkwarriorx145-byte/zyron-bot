const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function resolveRole(message, input) {
  if (!input) return null;

  const mentioned = message.mentions.roles.first();
  if (mentioned) return mentioned;

  const roleId = String(input).replace(/[<@&>]/g, '');
  if (!/^\d{15,25}$/.test(roleId)) return null;

  return message.guild.roles.cache.get(roleId) || null;
}

function roleLine(id) {
  return id ? '<@&' + id + '>' : 'Not set';
}

async function setRole(message, args, field, label) {
  const role = resolveRole(message, args[1]);

  if (!role) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('❌ Invalid Role')
          .setDescription('Mention a role or give a valid role ID.')
      ]
    });
  }

  if (!role.editable) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('❌ Role Too High')
          .setDescription('That role is above my highest role, so I cannot give it. Move my role above it first.')
      ]
    });
  }

  const update = {};
  update[field] = role.id;
  db.updateGuild(message.guild.id, update);

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ ' + label + ' Set')
        .setDescription('That role will now be given automatically to ' + label.toLowerCase() + '.')
    ]
  });
}

module.exports = {
  name: 'autorole',
  aliases: ['autoroles', 'joinrole', 'boosterrole', 'botrole'],
  description: 'Automatically gives roles to members, bots and server boosters.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<set <@role>|bot <@role>|booster <@role>|remove <join|bot|booster|all>|list>',
  subcommands: [
    { name: 'set <@role>', description: 'Role given to every new human member who joins.' },
    { name: 'bot <@role>', description: 'Role given to every bot that joins.' },
    { name: 'booster <@role>', description: 'Role given automatically to server boosters.' },
    { name: 'remove <join|bot|booster|all>', description: 'Disable one or every automatic role.' },
    { name: 'list', description: 'Show the current autorole configuration.' }
  ],
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;

    if (sub === 'set' || sub === 'join' || sub === 'member' || sub === 'members') {
      return setRole(message, args, 'autoRoleId', 'Join Role');
    }

    if (sub === 'bot' || sub === 'bots') {
      return setRole(message, args, 'autoRoleBotId', 'Bot Role');
    }

    if (sub === 'booster' || sub === 'boost' || sub === 'boosterrole') {
      return setRole(message, args, 'boosterRoleId', 'Booster Role');
    }

    if (sub === 'remove' || sub === 'disable' || sub === 'reset') {
      const what = (args[1] || '').toLowerCase();

      if (what === 'booster' || what === 'boost') {
        db.updateGuild(message.guild.id, { boosterRoleId: null });
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Booster Role Disabled').setDescription('Boosters will no longer receive an automatic role.')]
        });
      }

      if (what === 'bot' || what === 'bots') {
        db.updateGuild(message.guild.id, { autoRoleBotId: null });
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Bot Role Disabled').setDescription('New bots will no longer receive an automatic role.')]
        });
      }

      if (what === 'join' || what === 'member' || what === 'members') {
        db.updateGuild(message.guild.id, { autoRoleId: null });
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Join Role Disabled').setDescription('New members will no longer receive an automatic role.')]
        });
      }

      db.updateGuild(message.guild.id, {
        autoRoleId: null,
        autoRoleBotId: null,
        boosterRoleId: null
      });

      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ AutoRole Disabled').setDescription('Member, bot and booster roles were all removed.')]
      });
    }

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('⚙️ AutoRole Settings')
          .setDescription(
            '**Member Role:** ' + roleLine(settings.autoRoleId) + '\n' +
            '**Bot Role:** ' + roleLine(settings.autoRoleBotId) + '\n' +
            '**Booster Role:** ' + roleLine(settings.boosterRoleId) + '\n\n' +
            '**' + prefix + 'autorole set @role** — role for new members\n' +
            '**' + prefix + 'autorole bot @role** — role for new bots\n' +
            '**' + prefix + 'autorole booster @role** — role for boosters\n' +
            '**' + prefix + 'autorole remove join** — disable the member role\n' +
            '**' + prefix + 'autorole remove bot** — disable the bot role\n' +
            '**' + prefix + 'autorole remove booster** — disable the booster role\n' +
            '**' + prefix + 'autorole remove all** — disable everything'
          )
          .setFooter({ text: config.botName + ' • Powered by ' + config.company })
          .setTimestamp()
      ]
    });
  }
};
