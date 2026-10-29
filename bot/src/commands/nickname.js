const { PermissionsBitField } = require('discord.js');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const db = require('../database/db');
const nicknameUtil = require('../utils/nickname');
const protection = require('../utils/protection');
const staffTracker = require('../utils/staffTracker');
const notifications = require('../utils/notifications');
const config = require('../../config.json');

module.exports = {
  name: 'nickname',
  aliases: ['nick', 'setnick'],
  description: 'Set, reset or audit member nicknames with banned-pattern protection.',
  permissions: [PermissionsBitField.Flags.ManageNicknames],
  usage: '<@user> <nickname|reset> | patterns | fix',
  async execute(client, message, args) {
    const sub = String(args[0] || '').toLowerCase();
    const prefix = (db.getGuild(message.guild.id).prefix) || config.prefix;

    if (sub === 'patterns') {
      const settings = db.getGuild(message.guild.id);
      const patterns = settings.bannedNickPatterns && settings.bannedNickPatterns.length
        ? settings.bannedNickPatterns
        : nicknameUtil.BANNED_NICK_PATTERNS.map(function (pattern) { return pattern.source; });
      return message.reply({
        embeds: [ZyronEmbedBuilder.info('Banned Nickname Patterns', patterns.map(function (pattern, index) {
          return '**' + (index + 1) + '.** `' + pattern + '`';
        }).join('\n') || 'No patterns configured.')]
      });
    }

    if (sub === 'fix') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Denied', 'Only administrators can run a nickname audit.')] });
      }
      const fixed = await nicknameUtil.autoFixNicknames(message.guild);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Nickname Audit', 'Reset **' + fixed + '** nickname(s) that matched banned patterns.')] });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply({
        embeds: [ZyronEmbedBuilder.error('Missing Member', 'Usage: `' + prefix + 'nickname @user NewName` or `' + prefix + 'nickname @user reset`.')]
      });
    }

    if (protection.isProtectedUser(target.id)) {
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('Protected User', 'The main owner and main admin cannot be renamed by Zyron.')] });
    }

    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Permission Error', 'You cannot rename someone with an equal or higher role.')] });
    }

    const isReset = String(args[1] || '').toLowerCase() === 'reset';
    const nickname = isReset ? '' : args.slice(1).join(' ').trim();

    if (!isReset && !nickname) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Nickname', 'Provide a nickname or use `reset`.')] });
    }

    const result = isReset
      ? await nicknameUtil.resetNickname(target, 'Nickname reset by ' + message.author.tag)
      : await nicknameUtil.setNickname(target, nickname, 'Nickname set by ' + message.author.tag);

    if (!result.success) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Nickname Error', result.reason || 'Could not change that nickname.')] });
    }

    staffTracker.logStaffAction(message.guild.id, message.author.id, 'nickname', {
      target: target.id,
      oldNick: result.oldNick,
      newNick: result.newNick
    });

    notifications.dmSecurityAction(target, {
      action: 'Nickname changed',
      reason: result.oldNick + ' -> ' + result.newNick
    }).catch(function () {});

    return message.reply({
      embeds: [ZyronEmbedBuilder.success('Nickname Updated', '**' + target.user.tag + '** is now **' + result.newNick + '**.')]
    });
  }
};
