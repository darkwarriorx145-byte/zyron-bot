const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const staffTracker = require('../utils/staffTracker');

function ago(timestamp) {
  if (!timestamp) return 'never';
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

module.exports = {
  name: 'staffops',
  aliases: ['staffactivity', 'stafftrack'],
  description: 'Staff Operations: activity, action logs and promotion advice.',
  usage: '<status|leaderboard|advice|log|settings|enable|disable|review>',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  subcommands: [
    { name: 'status', description: 'Show staff operations overview.' },
    { name: 'leaderboard', description: 'Show the most active staff members.' },
    { name: 'advice', description: 'Show promotion, review and demotion advice.' },
    { name: 'log', description: 'Show recent staff actions.' },
    { name: 'settings', description: 'Show Staff Operations settings.' },
    { name: 'enable|disable', description: 'Toggle staff activity tracking.' },
    { name: 'review', description: 'Run a promotion review and post it to the advice channel.' }
  ],
  async execute(client, message, args) {
    const guild = message.guild;
    const settings = db.getGuild(guild.id);
    const sub = (args.shift() || 'status').toLowerCase();

    if (sub === 'enable' || sub === 'disable') {
      db.updateGuild(guild.id, { staffOpsEnabled: sub === 'enable' });
      return message.reply('Staff Operations tracking is now **' + sub + 'd**.');
    }

    if (sub === 'settings') {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('⚙️ Staff Operations Settings')
            .setDescription(
              '**Tracking:** ' + (settings.staffOpsEnabled ? 'Enabled' : 'Disabled') + '\n' +
              '**Staff log channel:** ' + (settings.staffLogChannelId ? '<#' + settings.staffLogChannelId + '>' : 'Not set') + '\n' +
              '**Advice channel:** ' + (settings.staffAdviceChannelId ? '<#' + settings.staffAdviceChannelId + '>' : 'Not set') + '\n' +
              '**Promotion threshold:** ' + settings.staffPromotionThreshold + ' points\n' +
              '**Inactive after:** ' + settings.staffInactiveDays + ' days\n' +
              '**Review interval:** every ' + settings.staffReviewIntervalHours + ' hour(s)'
            )
            .setFooter({ text: config.botName + ' Staff Operations | Powered by ' + config.company })
        ]
      });
    }

    if (sub === 'log') {
      const actions = staffTracker.getRecentActions(guild.id, 12);
      const lines = actions.map(function (action) {
        return '• <@' + action.staffId + '> — **' + action.action.replace(/_/g, ' ') + '** • ' + ago(action.timestamp) +
          (action.details && action.details.reason ? ' • ' + String(action.details.reason).slice(0, 120) : '');
      });
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📋 Recent Staff Actions')
            .setDescription(lines.length ? lines.join('\n') : 'No staff actions recorded yet.')
        ]
      });
    }

    if (sub === 'advice') {
      const advice = staffTracker.generateAdvice(guild.id, settings);
      const lines = advice.slice(0, 12).map(function (row) {
        const icon = row.action === 'promote' ? '📈' : (row.action === 'demote' ? '📉' : (row.action === 'review' ? '🔎' : '✅'));
        return icon + ' <@' + row.userId + '> — **' + row.action.toUpperCase() + '** (score ' + row.score + ')\n' + row.reason;
      });
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📈 Staff Promotion Advice')
            .setDescription(lines.length ? lines.join('\n\n').slice(0, 4000) : 'Not enough staff activity yet. Advice appears after staff take actions or reply in tickets.')
            .setFooter({ text: 'Promotion threshold: ' + settings.staffPromotionThreshold + ' points' })
        ]
      });
    }

    if (sub === 'review') {
      const posted = await staffTracker.runReview(guild, settings);
      if (!posted) return message.reply('No promotion or demotion advice to post, or no advice channel is configured.');
      return message.reply('Staff promotion review posted (' + posted.length + ' recommendation' + (posted.length === 1 ? '' : 's') + ').');
    }

    const all = staffTracker.getAllStaffMetrics(guild.id);
    if (sub === 'leaderboard') {
      const lines = all.sort(function (a, b) { return b.efficiencyScore - a.efficiencyScore; }).slice(0, 10).map(function (row, index) {
        return '**#' + (index + 1) + '** <@' + row.userId + '> — **' + row.efficiencyScore + ' pts**\n' +
          row.ticketsClosed + ' closes • ' + row.moderationActions + ' mod actions • ' + row.messages + ' messages • ' + row.voiceMinutes + ' voice min • ' + row.commandsUsed + ' commands';
      });
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🏆 Staff Activity Leaderboard')
            .setDescription(lines.length ? lines.join('\n\n') : 'No staff activity recorded yet.')
        ]
      });
    }

    const activeCutoff = Date.now() - 7 * 86400000;
    const active = all.filter(function (row) { return (row.lastActive || 0) >= activeCutoff; });
    const promotions = staffTracker.generateAdvice(guild.id, settings).filter(function (row) { return row.action === 'promote'; });
    const recent = staffTracker.getRecentActions(guild.id, 5);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('👥 Staff Operations')
          .setDescription('Track staff activity, action logs and promotion recommendations.')
          .addFields(
            { name: 'Tracked staff', value: String(all.length), inline: true },
            { name: 'Active this week', value: String(active.length), inline: true },
            { name: 'Promotion ready', value: String(promotions.length), inline: true },
            { name: 'Recent activity', value: recent.length ? recent.map(function (row) {
              return '• <@' + row.staffId + '> ' + row.action.replace(/_/g, ' ') + ' • ' + ago(row.timestamp);
            }).join('\n') : 'No actions logged yet.' }
          )
          .setFooter({ text: config.botName + ' Staff Operations | Powered by ' + config.company })
      ]
    });
  }
};
