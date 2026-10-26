const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');

function parseDuration(input) {
  if (!input) return null;
  const match = String(input).toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2];

  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function giveawayEmbed(data, ended, winnerId) {
  const embed = new EmbedBuilder()
    .setColor(ended ? config.colors.success : config.colors.primary)
    .setTitle((ended ? '🎉 GIVEAWAY ENDED — ' : '🎉 GIVEAWAY — ') + data.prize)
    .setDescription(
      (ended
        ? '**Winner:** ' + (winnerId ? '<@' + winnerId + '>' : 'No valid entries')
        : 'React with 🎉 to enter!') +
      '\n\n**Hosted by:** <@' + data.hostId + '>\n' +
      '**Ends:** ' + (ended ? 'Ended' : '<t:' + Math.floor(data.endsAt / 1000) + ':R>') +
      '\n**Entries:** ' + (data.entries ? data.entries.length : 0)
    )
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();

  return embed;
}

async function finish(client, messageId) {
  const data = client.giveaways.get(messageId);
  if (!data || data.ended) return null;

  data.ended = true;

  const guild = client.guilds.cache.get(data.guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(data.channelId);
  if (!channel) return null;

  const message = await channel.messages.fetch(messageId).catch(function () {
    return null;
  });

  let entries = [];

  if (message) {
    const reaction = message.reactions.cache.get('🎉');
    if (reaction) {
      const users = await reaction.users.fetch().catch(function () {
        return null;
      });
      if (users) {
        entries = users.filter(function (user) {
          return !user.bot;
        }).map(function (user) {
          return user.id;
        });
      }
    }
  }

  data.entries = entries;
  const winnerId = entries.length > 0 ? entries[Math.floor(Math.random() * entries.length)] : null;
  data.winnerId = winnerId;

  if (message) {
    await message.edit({ embeds: [giveawayEmbed(data, true, winnerId)] }).catch(function () {});
  }

  channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(winnerId ? config.colors.success : config.colors.danger)
        .setTitle(winnerId ? '🎉 Giveaway Winner' : '❌ Giveaway Ended')
        .setDescription(
          winnerId
            ? 'Congratulations <@' + winnerId + '>, you won **' + data.prize + '**!\nMessage the host <@' + data.hostId + '> to claim your prize.'
            : 'Nobody entered the giveaway for **' + data.prize + '**.'
        )
    ]
  }).catch(function () {});

  return winnerId;
}

module.exports = {
  name: 'giveaway',
  aliases: ['gw', 'giveaways'],
  description: 'Start, end and reroll reaction giveaways.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<start <duration> <prize>|end <messageID>|reroll <messageID>|list>',
  subcommands: [
    { name: 'start <10m|2h|1d> <prize>', description: 'Start a giveaway in this channel.' },
    { name: 'end <messageID>', description: 'End a giveaway immediately.' },
    { name: 'reroll <messageID>', description: 'Pick a new winner for an ended giveaway.' },
    { name: 'list', description: 'List every active giveaway.' }
  ],
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const prefix = dbPrefix(message);

    if (sub === 'start') {
      const duration = parseDuration(args[1]);
      const prize = args.slice(2).join(' ').trim();

      if (!duration || !prize) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ Invalid Giveaway')
              .setDescription('Usage: **' + prefix + 'giveaway start 10m Nitro Classic**')
          ]
        });
      }

      const endsAt = Date.now() + duration;
      const data = {
        guildId: message.guild.id,
        channelId: message.channel.id,
        hostId: message.author.id,
        prize: prize,
        endsAt: endsAt,
        ended: false,
        entries: []
      };

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🎉 GIVEAWAY — ' + prize)
        .setDescription(
          'React with 🎉 to enter!\n\n' +
          '**Hosted by:** <@' + message.author.id + '>\n' +
          '**Ends:** <t:' + Math.floor(endsAt / 1000) + ':R>\n' +
          '**Entries:** 0'
        )
        .setFooter({ text: config.botName + ' • Powered by ' + config.company })
        .setTimestamp();

      const sent = await message.channel.send({ embeds: [embed] });
      await sent.react('🎉').catch(function () {});

      data.messageId = sent.id;
      data.timer = setTimeout(function () {
        finish(client, sent.id).catch(function (err) {
          console.error('Giveaway finish error:', err);
        });
      }, duration);

      client.giveaways.set(sent.id, data);

      if (message.deletable) message.delete().catch(function () {});
      return;
    }

    if (sub === 'end') {
      const id = args[1];
      if (!id) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Missing ID').setDescription('Usage: **' + prefix + 'giveaway end <messageID>**')] });
      }
      const data = client.giveaways.get(id);
      if (!data || data.ended) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Giveaway Not Found').setDescription('That giveaway does not exist or already ended.')] });
      }
      await finish(client, id);
      return;
    }

    if (sub === 'reroll') {
      const id = args[1];
      const data = client.giveaways.get(id);

      if (!data || !data.ended || !data.entries || data.entries.length === 0) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Nothing To Reroll').setDescription('That giveaway has no entries.')] });
      }

      const winnerId = data.entries[Math.floor(Math.random() * data.entries.length)];
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('🎉 Giveaway Rerolled')
            .setDescription('The new winner for **' + data.prize + '** is <@' + winnerId + '>!')
        ]
      });
    }

    if (sub === 'list') {
      const active = [];
      client.giveaways.forEach(function (data) {
        if (!data.ended) active.push(data);
      });

      if (active.length === 0) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('🎉 No Active Giveaways').setDescription('Start one with **' + prefix + 'giveaway start 10m Prize**')] });
      }

      const lines = active.map(function (data) {
        return '• **' + data.prize + '** — <#' + data.channelId + '> — ends <t:' + Math.floor(data.endsAt / 1000) + ':R> — ID **' + data.messageId + '**';
      });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🎉 Active Giveaways (' + active.length + ')')
            .setDescription(lines.join('\n'))
        ]
      });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Unknown Subcommand').setDescription('Use **' + prefix + 'giveaway start|end|reroll|list**')] });
  }
};

function dbPrefix(message) {
  try {
    const db = require('../database/db');
    const settings = db.getGuild(message.guild.id);
    return settings.prefix || config.prefix;
  } catch (err) {
    return config.prefix;
  }
}
