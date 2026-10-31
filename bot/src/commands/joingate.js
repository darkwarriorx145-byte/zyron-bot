const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const joinGate = require('../utils/joinGate');

function roleFrom(message, raw) {
  if (!raw) return null;
  const id = raw.replace(/[<@&>]/g, '');
  return message.guild.roles.cache.get(id) || null;
}

function channelFrom(message, raw) {
  if (!raw) return null;
  const id = raw.replace(/[<#>]/g, '');
  return message.guild.channels.cache.get(id) || null;
}

function memberFrom(message, raw) {
  if (!raw) return null;
  const id = raw.replace(/[<@!>]/g, '');
  return message.guild.members.cache.get(id) || null;
}

function statusEmbed(guild, settings) {
  const status = joinGate.getStatus(guild.id);
  const recent = status.events.slice(0, 8).map(function (event) {
    return '• <@' + event.userId + '> — **' + event.status + '** (risk ' + event.score + ')';
  });
  return new EmbedBuilder()
    .setColor(settings.joinGateEnabled ? config.colors.success : config.colors.neutral)
    .setTitle('🛡️ Join Gate 2.0')
    .setDescription(
      '**Status:** ' + (settings.joinGateEnabled ? 'Enabled' : 'Disabled') + '\n' +
      '**Challenge:** ' + (settings.joinGateChallengeEnabled ? 'On' : 'Off') + '\n' +
      '**Risk threshold:** ' + settings.joinGateRiskThreshold + '/100\n' +
      '**High-risk action:** ' + settings.joinGateHighRiskAction + '\n' +
      '**Quarantine role:** ' + (settings.joinGateQuarantineRoleId ? '<@&' + settings.joinGateQuarantineRoleId + '>' : 'Not set') + '\n' +
      '**Honeypot:** ' + (settings.joinGateHoneypotChannelId ? '<#' + settings.joinGateHoneypotChannelId + '> (' + settings.joinGateHoneypotAction + ')' : 'Not set')
    )
    .addFields(
      { name: 'Pending review', value: String(status.stats.pending), inline: true },
      { name: 'Verified', value: String(status.stats.verified), inline: true },
      { name: 'Blocked', value: String(status.stats.blocked), inline: true }
    )
    .addFields({ name: 'Recent joins', value: recent.length ? recent.join('\n') : 'No join gate events yet.' })
    .setFooter({ text: config.botName + ' Join Gate | Powered by ' + config.company });
}

module.exports = {
  name: 'joingate',
  aliases: ['gate'],
  description: 'Join Gate 2.0: risk scoring, quarantine, human checks and honeypot traps.',
  usage: '<status|enable|disable|challenge|threshold|quarantine|honeypot|log|risk|release|kick>',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  subcommands: [
    { name: 'status', description: 'Show join gate status and recent joins.' },
    { name: 'enable', description: 'Enable Join Gate 2.0.' },
    { name: 'disable', description: 'Disable Join Gate 2.0.' },
    { name: 'challenge <on|off>', description: 'Require a human check for new members.' },
    { name: 'threshold <0-100>', description: 'Set the high-risk score threshold.' },
    { name: 'quarantine <#role|off>', description: 'Set the role new members keep until they pass.' },
    { name: 'honeypot <#channel|off> [timeout|kick|ban]', description: 'Set a trap channel and punishment.' },
    { name: 'log <#channel|off>', description: 'Set the join gate log channel.' },
    { name: 'risk [@user]', description: 'Preview the risk score for a member.' },
    { name: 'release <@user>', description: 'Release a quarantined member.' },
    { name: 'kick <@user>', description: 'Kick a held member.' }
  ],
  async execute(client, message, args) {
    const guild = message.guild;
    const settings = db.getGuild(guild.id);
    const sub = (args.shift() || 'status').toLowerCase();

    if (sub === 'status') {
      return message.channel.send({ embeds: [statusEmbed(guild, settings)] });
    }

    if (sub === 'enable' || sub === 'disable') {
      db.updateGuild(guild.id, { joinGateEnabled: sub === 'enable' });
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.success).setDescription('Join Gate is now **' + sub + 'd**.')] });
    }

    if (sub === 'challenge') {
      const value = (args[0] || '').toLowerCase();
      if (['on', 'off'].indexOf(value) === -1) return message.reply('Use .joingate challenge on or .joingate challenge off.');
      db.updateGuild(guild.id, { joinGateChallengeEnabled: value === 'on' });
      return message.reply('Join Gate human check is now **' + value + '**.');
    }

    if (sub === 'threshold') {
      const value = Math.max(0, Math.min(100, parseInt(args[0], 10)));
      if (isNaN(value)) return message.reply('Give me a number from 0 to 100.');
      db.updateGuild(guild.id, { joinGateRiskThreshold: value });
      return message.reply('Join Gate risk threshold set to **' + value + '**.');
    }

    if (sub === 'quarantine') {
      const raw = args[0] || '';
      if (raw.toLowerCase() === 'off') {
        db.updateGuild(guild.id, { joinGateQuarantineRoleId: null });
        return message.reply('Join Gate quarantine role cleared.');
      }
      const role = roleFrom(message, raw);
      if (!role) return message.reply('Mention a role or give a role ID.');
      db.updateGuild(guild.id, { joinGateQuarantineRoleId: role.id });
      return message.reply('Join Gate quarantine role set to ' + role + '.');
    }

    if (sub === 'honeypot') {
      const raw = args[0] || '';
      if (raw.toLowerCase() === 'off') {
        db.updateGuild(guild.id, { joinGateHoneypotChannelId: null });
        return message.reply('Join Gate honeypot cleared.');
      }
      const channel = channelFrom(message, raw);
      if (!channel) return message.reply('Mention a channel or give a channel ID.');
      const action = ['timeout', 'kick', 'ban'].indexOf((args[1] || '').toLowerCase()) !== -1
        ? args[1].toLowerCase()
        : settings.joinGateHoneypotAction;
      db.updateGuild(guild.id, { joinGateHoneypotChannelId: channel.id, joinGateHoneypotAction: action });
      return message.reply('Honeypot set to ' + channel + ' with **' + action + '**.');
    }

    if (sub === 'log') {
      const raw = args[0] || '';
      if (raw.toLowerCase() === 'off') {
        db.updateGuild(guild.id, { joinGateLogChannelId: null });
        return message.reply('Join Gate log channel cleared.');
      }
      const channel = channelFrom(message, raw);
      if (!channel) return message.reply('Mention a channel or give a channel ID.');
      db.updateGuild(guild.id, { joinGateLogChannelId: channel.id });
      return message.reply('Join Gate logs will go to ' + channel + '.');
    }

    if (sub === 'risk') {
      const target = memberFrom(message, args[0]) || message.member;
      const risk = joinGate.assessRisk(guild, target, settings);
      const factors = risk.factors.length
        ? risk.factors.map(function (factor) { return '• ' + factor.label + ' (+' + factor.points + ')'; }).join('\n')
        : 'No risk factors.';
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(risk.score >= settings.joinGateRiskThreshold ? config.colors.danger : config.colors.success)
            .setTitle('Join Gate Risk — ' + target.user.tag)
            .setDescription('**Score:** ' + risk.score + '/100\n**Account age:** ' + risk.accountAgeDays + ' days\n\n' + factors)
        ]
      });
    }

    if (sub === 'release' || sub === 'kick') {
      const target = memberFrom(message, args[0]);
      if (!target) return message.reply('Mention the member or give their ID.');
      const event = joinGate.findPendingEvent(guild.id, target.id);
      if (!event) return message.reply('That member has no pending join gate event.');
      await joinGate.resolveEvent(guild, settings, event.id, sub === 'release' ? 'release' : 'kick', message.author.id);
      return message.reply('Join Gate event **' + sub + '** completed for ' + target + '.');
    }

    return message.reply('Unknown Join Gate option. Try .joingate status.');
  }
};
