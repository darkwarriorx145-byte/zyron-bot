const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const levels = require('../utils/levels');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

function progressBar(progress, needed) {
  const size = 12;
  const ratio = needed > 0 ? Math.min(1, progress / needed) : 0;
  const filled = Math.round(ratio * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function roleFromArg(message, raw) {
  if (!raw) return null;
  const id = raw.replace(/[<@&>]/g, '');
  return message.guild.roles.cache.get(id) || null;
}

module.exports = {
  name: 'levels',
  aliases: ['level', 'rank', 'xp'],
  description: 'Levels and XP for activity, voice time and coin rewards.',
  usage: '<rank|leaderboard|settings|enable|disable|reward|channel|reset>',
  subcommands: [
    { name: 'rank [@user]', description: 'Show your level, XP progress and activity.' },
    { name: 'leaderboard', description: 'Show the top members by XP.' },
    { name: 'settings', description: 'View level settings (Manage Server).', admin: true },
    { name: 'enable', description: 'Enable levels and XP (Manage Server).', admin: true },
    { name: 'disable', description: 'Disable levels and XP (Manage Server).', admin: true },
    { name: 'setmessage <xp>', description: 'Set XP per message (Manage Server).', admin: true },
    { name: 'setvoice <xp>', description: 'Set XP per voice minute (Manage Server).', admin: true },
    { name: 'setcooldown <seconds>', description: 'Set the message XP cooldown (Manage Server).', admin: true },
    { name: 'setcoins <message|voice|level> <amount>', description: 'Set coin rewards (Manage Server).', admin: true },
    { name: 'channel [#channel]', description: 'Set the level-up announcement channel (Manage Server).', admin: true },
    { name: 'reward <level> <@role>', description: 'Give a role when a member reaches a level (Manage Server).', admin: true },
    { name: 'removereward <level>', description: 'Remove a level role reward (Manage Server).', admin: true },
    { name: 'reset [@user]', description: 'Reset a member\'s XP (Manage Server).', admin: true }
  ],

  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const canManage = message.member && message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (!sub || sub === 'help') {
      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📈 Zyron Levels & XP')
          .setDescription(
            'Members earn XP and coins by chatting and spending time in voice channels.\n\n' +
            '**Commands**\n' +
            prefix + 'levels rank [@user] — Level and progress\n' +
            prefix + 'levels leaderboard — Top members\n' +
            (canManage
              ? '\n**Admin (Manage Server)**\n' +
                prefix + 'levels enable / disable\n' +
                prefix + 'levels setmessage <xp>\n' +
                prefix + 'levels setvoice <xp>\n' +
                prefix + 'levels setcooldown <seconds>\n' +
                prefix + 'levels setcoins <message|voice|level> <amount>\n' +
                prefix + 'levels channel #channel\n' +
                prefix + 'levels reward <level> @role\n' +
                prefix + 'levels removereward <level>\n' +
                prefix + 'levels reset @user'
              : '')
          )
          .setFooter({ text: config.botName + ' Levels | Powered by ' + config.company })
          .setTimestamp()]
      });
    }

    if (sub === 'rank' || sub === 'profile') {
      const target = message.mentions.users.first() || message.author;
      const member = message.guild.members.cache.get(target.id) || message.member;
      const rank = levels.getRank(message.guild.id, target.id);
      const xpNext = levels.xpToNext(rank.level);
      const channel = settings.levelUpChannelId ? '<#' + settings.levelUpChannelId + '>' : '*not set*';

      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
          .setTitle('📈 ' + target.username + ' — Level ' + rank.level)
          .setDescription(
            progressBar(rank.progress, xpNext) + ' **' + rank.progress + ' / ' + xpNext + ' XP**\n' +
            '**Rank:** #' + rank.rank + ' of ' + rank.totalUsers + '\n\n' +
            '**Total XP:** ' + rank.totalXp + '\n' +
            '**Messages:** ' + rank.messages + '\n' +
            '**Voice minutes:** ' + rank.voiceMinutes + '\n' +
            '**Coins earned:** ' + rank.coinsEarned
          )
          .setFooter({ text: 'Level up announcements: ' + channel.trim() })
          .setTimestamp()]
      });
    }

    if (sub === 'leaderboard' || sub === 'lb' || sub === 'top') {
      const top = levels.getLeaderboard(message.guild.id, 10);
      if (top.length === 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('No XP Yet', 'Start chatting to earn XP!')] });
      }
      const lines = top.map(function (entry, index) {
        return '**' + (index + 1) + '.** <@' + entry.userId + '> — Level **' + entry.level + '** • ' + entry.totalXp + ' XP';
      });
      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🏆 XP Leaderboard — ' + message.guild.name)
          .setDescription(lines.join('\n'))
          .setFooter({ text: config.botName + ' Levels' })
          .setTimestamp()]
      });
    }

    if (sub === 'settings' || sub === 'config') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to view level settings.')] });
      const rewards = (settings.levelRewards || []).slice().sort(function (a, b) { return a.level - b.level; });
      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('⚙️ Level Settings')
          .setDescription(
            '**Status:** ' + (settings.levelsEnabled ? 'Enabled' : 'Disabled') + '\n' +
            '**XP per message:** ' + settings.xpPerMessage + '\n' +
            '**Message cooldown:** ' + settings.xpMessageCooldown + 's\n' +
            '**XP per voice minute:** ' + settings.xpPerVoiceMinute + '\n' +
            '**Coins per message:** ' + settings.coinsPerMessage + '\n' +
            '**Coins per voice minute:** ' + settings.coinsPerVoiceMinute + '\n' +
            '**Coins per level:** ' + settings.coinsPerLevel + '\n' +
            '**Level-up channel:** ' + (settings.levelUpChannelId ? '<#' + settings.levelUpChannelId + '>' : '*not set*') + '\n\n' +
            '**Role rewards**\n' +
            (rewards.length > 0
              ? rewards.map(function (reward) { return '• Level ' + reward.level + ' → <@&' + reward.roleId + '>'; }).join('\n')
              : 'No role rewards yet.')
          )
          .setFooter({ text: config.botName + ' Levels' })
          .setTimestamp()]
      });
    }

    if (sub === 'enable' || sub === 'disable') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level settings.')] });
      const enabled = sub === 'enable';
      db.updateGuild(message.guild.id, { levelsEnabled: enabled });
      if (enabled) levels.startVoiceLoop(client);
      return message.reply({ embeds: [ZyronEmbedBuilder.success(enabled ? 'Levels Enabled' : 'Levels Disabled', enabled ? 'Members now earn XP and coins from activity.' : 'XP and activity rewards are paused.')] });
    }

    if (sub === 'setmessage' || sub === 'setvoice' || sub === 'setcooldown') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level settings.')] });
      const value = parseInt(args[1], 10);
      if (isNaN(value) || value < 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Amount', 'Give a whole number of 0 or more.')] });
      }
      const updates = {};
      if (sub === 'setmessage') updates.xpPerMessage = Math.min(1000, value);
      if (sub === 'setvoice') updates.xpPerVoiceMinute = Math.min(1000, value);
      if (sub === 'setcooldown') updates.xpMessageCooldown = Math.min(86400, value);
      db.updateGuild(message.guild.id, updates);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Level Setting Updated', 'Saved **' + value + '**.')] });
    }

    if (sub === 'setcoins') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level settings.')] });
      const kind = (args[1] || '').toLowerCase();
      const value = parseInt(args[2], 10);
      if (['message', 'voice', 'level'].indexOf(kind) === -1 || isNaN(value) || value < 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Usage', 'Use ' + prefix + 'levels setcoins <message|voice|level> <amount>.')] });
      }
      const updates = {};
      if (kind === 'message') updates.coinsPerMessage = Math.min(100000, value);
      if (kind === 'voice') updates.coinsPerVoiceMinute = Math.min(100000, value);
      if (kind === 'level') updates.coinsPerLevel = Math.min(100000, value);
      db.updateGuild(message.guild.id, updates);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Coin Reward Updated', '**' + kind + '** now gives **' + value + '** coins.')] });
    }

    if (sub === 'channel') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level settings.')] });
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!channel || !channel.isTextBased()) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Channel', 'Mention a text channel.')] });
      }
      db.updateGuild(message.guild.id, { levelUpChannelId: channel.id });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Level Channel Set', 'Level-up announcements will post in <#' + channel.id + '>.')] });
    }

    if (sub === 'reward') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level rewards.')] });
      const level = parseInt(args[1], 10);
      const role = roleFromArg(message, args[2]);
      if (isNaN(level) || level < 1 || !role) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Reward', 'Use ' + prefix + 'levels reward <level> @role.')] });
      }
      if (!role.editable) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Role Not Editable', 'Move my role above **' + role.name + '**.')] });
      }
      const rewards = (settings.levelRewards || []).filter(function (reward) { return reward.level !== level; });
      rewards.push({ level: level, roleId: role.id, message: args.slice(3).join(' ').trim() || null });
      rewards.sort(function (a, b) { return a.level - b.level; });
      db.updateGuild(message.guild.id, { levelRewards: rewards });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Level Reward Saved', 'Members who reach level **' + level + '** will receive <@&' + role.id + '>.')] });
    }

    if (sub === 'removereward') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to change level rewards.')] });
      const level = parseInt(args[1], 10);
      if (isNaN(level)) return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Level', 'Give the level number to remove.')] });
      const rewards = (settings.levelRewards || []).filter(function (reward) { return reward.level !== level; });
      db.updateGuild(message.guild.id, { levelRewards: rewards });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Level Reward Removed', 'Level **' + level + '** no longer grants a role.')] });
    }

    if (sub === 'reset') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to reset XP.')] });
      const target = message.mentions.users.first() || message.author;
      levels.resetUser(message.guild.id, target.id);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('XP Reset', 'Reset XP for **' + target.tag + '**.')] });
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'levels to see every option.')] });
  }
};
