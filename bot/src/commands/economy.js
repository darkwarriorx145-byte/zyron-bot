const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

const SUBCOMMANDS = [
  { name: 'daily', description: 'Claim your daily reward (amount set by the server).' },
  { name: 'balance [@user]', description: 'Check your balance or another users balance.' },
  { name: 'pay @user <amount>', description: 'Transfer coins to another user.' },
  { name: 'leaderboard', description: 'Show the top 10 richest users in this server.' },
  { name: 'settings', description: 'Show the server economy rewards (Manage Server).', admin: true },
  { name: 'setdaily <amount>', description: 'Set the daily reward amount (Manage Server).', admin: true },
  { name: 'setinvite <amount>', description: 'Set the invite reward amount (Manage Server).', admin: true }
];

module.exports = {
  name: 'economy',
  aliases: ['eco', 'coins', 'bal'],
  description: 'Economy system with daily rewards, coins and transfers.',
  usage: '<daily|balance|pay|leaderboard|settings|setdaily|setinvite>',
  subcommands: SUBCOMMANDS,
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const canManage = message.member && message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (!sub || sub === 'help') {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('💰 Zyron Economy System')
            .setDescription(
              'Earn, save and trade Zyron Coins.\n\n' +
              '**Commands**\n' +
              prefix + 'economy daily — Claim ' + settings.economyDaily + ' coins every 24 hours\n' +
              prefix + 'economy balance [@user] — Check coin balance\n' +
              prefix + 'economy pay @user <amount> — Send coins to someone\n' +
              prefix + 'economy leaderboard — Richest members\n\n' +
              '**Server Rewards**\n' +
              '• Daily reward: **' + settings.economyDaily + '** coins\n' +
              '• Invite reward: **' + settings.economyInvite + '** coins per real join\n\n' +
              (canManage
                ? '**Admin (Manage Server)**\n' +
                  prefix + 'economy settings — View the current rewards\n' +
                  prefix + 'economy setdaily <amount> — Set the daily reward\n' +
                  prefix + 'economy setinvite <amount> — Set the invite reward (0 disables)'
                : 'Server admins can change these rewards with the economy settings commands.')
            )
            .setFooter({ text: config.botName + ' Economy | Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'settings' || sub === 'config') {
      if (!canManage) {
        return message.reply({
          embeds: [
            ZyronEmbedBuilder.error(
              'Manage Server Required',
              'You need the **Manage Server** permission to view economy settings.'
            )
          ]
        });
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('💰 Economy Settings')
            .setDescription(
              '**Daily reward:** **' + settings.economyDaily + '** coins\n' +
              '**Invite reward:** **' + settings.economyInvite + '** coins per real join\n\n' +
              'Use **' + prefix + 'economy setdaily <amount>** and **' + prefix + 'economy setinvite <amount>** to change them.'
            )
            .setFooter({ text: config.botName + ' Economy | Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'setdaily' || sub === 'setinvite') {
      if (!canManage) {
        return message.reply({
          embeds: [
            ZyronEmbedBuilder.error(
              'Manage Server Required',
              'You need the **Manage Server** permission to change economy settings.'
            )
          ]
        });
      }

      const raw = parseInt(args[1], 10);
      if (isNaN(raw)) {
        return message.reply({
          embeds: [
            ZyronEmbedBuilder.error(
              'Invalid Amount',
              'Give a whole number. Example: **' + prefix + 'economy ' + sub + ' 100**'
            )
          ]
        });
      }

      const isDaily = sub === 'setdaily';
      const value = isDaily ? Math.max(1, Math.min(100000, raw)) : Math.max(0, Math.min(100000, raw));

      db.updateGuild(message.guild.id, isDaily ? { economyDaily: value } : { economyInvite: value });

      return message.reply({
        embeds: [
          ZyronEmbedBuilder.success(
            isDaily ? 'Daily Reward Updated' : 'Invite Reward Updated',
            '**' + (isDaily ? 'Daily' : 'Invite') + ' reward:** **' + value + '** coins\n' +
            (isDaily
              ? 'Members receive this with **' + prefix + 'economy daily**.'
              : (value === 0 ? 'Invite rewards are now disabled.' : 'Inviters receive this for every real join.'))
          )
        ]
      });
    }

    if (sub === 'daily') {
      const key = 'daily:' + message.guild.id + ':' + message.author.id;
      const cooldown = db.getCooldown(key);
      const now = Date.now();

      if (cooldown && now - cooldown < 86400000) {
        const hours = Math.ceil((86400000 - (now - cooldown)) / 3600000);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.warning)
              .setTitle('⏳ Daily Reward Cooldown')
              .setDescription('You already claimed your daily reward today.\nCome back in **' + hours + '** hour(s).')
          ]
        });
      }

      db.setCooldown(key, now);

      const reward = Number(settings.economyDaily) > 0 ? Number(settings.economyDaily) : 100;
      db.addCoins(message.guild.id, message.author.id, reward);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('💰 Daily Reward Claimed')
            .setDescription('You received **' + reward + ' Zyron Coins**!\nCome back in 24 hours for more.')
        ]
      });
    }

    if (sub === 'balance' || sub === 'bal') {
      const target = message.mentions.users.first() || message.author;
      const coins = db.getCoins(message.guild.id, target.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
            .setTitle('💰 Coin Balance')
            .setDescription('**' + target.tag + '** has **' + coins + '** Zyron Coins.')
            .setFooter({ text: config.botName + ' Economy' })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'pay' || sub === 'transfer' || sub === 'give') {
      const target = message.mentions.users.first();
      const amount = parseInt(args[2]);

      if (!target || target.bot || target.id === message.author.id) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ Invalid User')
              .setDescription('Mention a real user to pay coins to.')
          ]
        });
      }

      if (isNaN(amount) || amount < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ Invalid Amount')
              .setDescription('Amount must be at least 1 coin.')
          ]
        });
      }

      const senderCoins = db.getCoins(message.guild.id, message.author.id);
      if (senderCoins < amount) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ Insufficient Coins')
              .setDescription('You only have **' + senderCoins + '** coins.')
          ]
        });
      }

      db.removeCoins(message.guild.id, message.author.id, amount);
      db.addCoins(message.guild.id, target.id, amount);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('💸 Coins Transferred')
            .setDescription('Sent **' + amount + '** coins to **' + target.tag + '**.')
        ]
      });
    }

    if (sub === 'leaderboard' || sub === 'lb' || sub === 'top') {
      const top = db.getCoinLeaderboard(message.guild.id, 10);

      if (top.length === 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.neutral)
              .setTitle('📊 No Coins Yet')
              .setDescription('No one has any coins yet. Start earning with ' + prefix + 'economy daily!')
          ]
        });
      }

      const lines = top.map(function (entry, i) {
        return '**' + (i + 1) + '.** <@' + entry.userId + '> — **' + entry.amount + '** coins';
      });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🏆 Coin Leaderboard — ' + message.guild.name)
            .setDescription(lines.join('\n'))
            .setFooter({ text: config.botName + ' Economy' })
            .setTimestamp()
        ]
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('❌ Unknown Subcommand')
          .setDescription('Use ' + prefix + 'economy to see every option.')
      ]
    });
  }
};