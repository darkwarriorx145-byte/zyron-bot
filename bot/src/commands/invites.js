const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

const P = PermissionsBitField.Flags;

async function resolveUser(client, message, input) {
  if (!input) return null;

  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;

  const userId = String(input).replace(/[<@!>]/g, '').trim();
  if (!/^\d{15,25}$/.test(userId)) return null;

  return client.users.fetch(userId).catch(function () {
    return null;
  });
}

function statsEmbed(user, stats) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setTitle('📨 Invite Stats')
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Total', value: '**' + stats.total + '**', inline: true },
      { name: 'Real', value: '**' + stats.real + '**', inline: true },
      { name: 'Fake', value: '**' + stats.fake + '**', inline: true },
      { name: 'Left', value: '**' + stats.left + '**', inline: true },
      { name: 'Rejoins', value: '**' + stats.rejoin + '**', inline: true }
    )
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();
}

function leaderboardEmbed(guildId, field, title) {
  const list = db.getInviteLeaderboard(guildId, field, 10).filter(function (entry) {
    return entry.amount > 0;
  });

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(title)
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();

  if (list.length === 0) {
    embed.setDescription('No invite data recorded for this server yet.');
    return embed;
  }

  const lines = list.map(function (entry, index) {
    return '**' + (index + 1) + '.** <@' + entry.userId + '> — **' + entry.amount + '**';
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

module.exports = {
  name: 'invites',
  aliases: ['invite', 'inv'],
  description: 'Tracks invites per server: real, fake, left, rejoin and totals.',
  usage: '[check [@user]|setup #channel|reset [@user]|add @user <amount>|remove @user <amount>|fake [@user]|leave [@user]|total|real|rejoin]',
  subcommands: [
    { name: 'check [@user]', description: 'Show a member invite stats.' },
    { name: 'setup #channel', description: 'Set the invite log channel for this server.' },
    { name: 'reset [@user]', description: 'Reset invites for one member or the whole server.' },
    { name: 'add @user <amount>', description: 'Give a member extra invites.' },
    { name: 'remove @user <amount>', description: 'Remove invites from a member.' },
    { name: 'fake [@user]', description: 'Show fake invites for a member or the leaderboard.' },
    { name: 'leave [@user]', description: 'Show leaves for a member or the leaderboard.' },
    { name: 'total', description: 'Total invite leaderboard.' },
    { name: 'real', description: 'Real invite leaderboard.' },
    { name: 'rejoin', description: 'Rejoin leaderboard.' }
  ],
  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const guildId = message.guild.id;
    const canManage = message.member.permissions.has(P.ManageGuild);

    let sub = (args[0] || '').toLowerCase();
    let targetInput = null;

    if (sub === 'check' || sub === 'me' || sub === '') {
      targetInput = args[1] || (sub === 'me' ? message.author.id : null);
      sub = 'check';
    } else if (sub.indexOf('<@') === 0 || /^\d{15,25}$/.test(sub)) {
      targetInput = sub;
      sub = 'check';
    }

    if (sub === 'setup') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to set the invite log channel.')] });
      }

      const channel = message.mentions.channels.first();
      if (!channel) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing Channel').setDescription('Usage: **' + prefix + 'invites setup #invite-logs**')] });
      }

      db.updateGuild(guildId, { inviteLogChannel: channel.id });

      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Invite Logs Set').setDescription('New invite activity will be logged in ' + channel + ' for **' + message.guild.name + '**.')]
      });
    }

    if (sub === 'reset') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to reset invites.')] });
      }

      const user = await resolveUser(client, message, args[1]);

      if (user) {
        db.resetInvites(guildId, user.id);
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Invites Reset').setDescription('Invite stats for ' + user.tag + ' were reset in this server.')] });
      }

      db.resetInvites(guildId);
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Server Invites Reset').setDescription('Every invite stat in **' + message.guild.name + '** was reset.')] });
    }

    if (sub === 'add' || sub === 'remove') {
      if (!canManage) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Permission Denied').setDescription('You need Manage Server to change invites.')] });
      }

      const user = await resolveUser(client, message, args[1]);
      const amount = parseInt(args[2], 10);

      if (!user || !amount || amount < 1) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Invalid Usage').setDescription('Usage: **' + prefix + 'invites ' + sub + ' @user <amount>**')] });
      }

      const value = sub === 'add' ? amount : -amount;
      db.addInvite(guildId, user.id, 'total', value);
      db.addInvite(guildId, user.id, 'real', value);

      const stats = db.getInviteStats(guildId, user.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle(sub === 'add' ? '✅ Invites Added' : '✅ Invites Removed')
            .setDescription(user.tag + ' now has **' + stats.total + '** total invites (**' + stats.real + '** real).')
        ]
      });
    }

    if (sub === 'fake' || sub === 'leave' || sub === 'rejoin') {
      const user = await resolveUser(client, message, args[1]);
      const field = sub === 'leave' ? 'left' : sub;

      if (user) {
        const stats = db.getInviteStats(guildId, user.id);
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.primary)
              .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
              .setTitle('📨 ' + sub.charAt(0).toUpperCase() + sub.slice(1) + ' Invites')
              .setDescription('**' + user.tag + '** has **' + (stats[field] || 0) + '** ' + sub + ' invites in **' + message.guild.name + '**.')
          ]
        });
      }

      const titles = {
        fake: '📨 Fake Invite Leaderboard',
        leave: '📨 Leave Leaderboard',
        rejoin: '📨 Rejoin Leaderboard'
      };

      return message.channel.send({ embeds: [leaderboardEmbed(guildId, field, titles[sub])] });
    }

    if (sub === 'total' || sub === 'real' || sub === 'leaderboard' || sub === 'lb') {
      const field = sub === 'real' ? 'real' : 'total';
      const title = sub === 'real' ? '📨 Real Invite Leaderboard' : '📨 Total Invite Leaderboard';
      return message.channel.send({ embeds: [leaderboardEmbed(guildId, field, title)] });
    }

    if (sub === 'check') {
      let target = targetInput ? await resolveUser(client, message, targetInput) : message.author;

      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ User Not Found').setDescription('Mention a valid member or give their user ID.')] });
      }

      const stats = db.getInviteStats(guildId, target.id);
      return message.channel.send({ embeds: [statsEmbed(target, stats)] });
    }

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📨 Invite Commands')
          .setDescription(
            '**' + prefix + 'invites [@user]** — check invites\n' +
            '**' + prefix + 'invites setup #channel** — invite log channel\n' +
            '**' + prefix + 'invites reset [@user]** — reset stats\n' +
            '**' + prefix + 'invites add @user <amount>** — add invites\n' +
            '**' + prefix + 'invites remove @user <amount>** — remove invites\n' +
            '**' + prefix + 'invites fake [@user]** — fake invites\n' +
            '**' + prefix + 'invites leave [@user]** — leaves\n' +
            '**' + prefix + 'invites total** — total leaderboard\n' +
            '**' + prefix + 'invites real** — real leaderboard\n' +
            '**' + prefix + 'invites rejoin** — rejoin leaderboard'
          )
      ]
    });
  }
};
