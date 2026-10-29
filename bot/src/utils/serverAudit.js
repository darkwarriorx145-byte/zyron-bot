const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');

let timer = null;

const DANGEROUS_PERMISSIONS = [
  { flag: 'Administrator', label: 'Administrator', weight: 10, critical: true },
  { flag: 'ManageGuild', label: 'Manage Server', weight: 6, critical: true },
  { flag: 'ManageRoles', label: 'Manage Roles', weight: 6, critical: true },
  { flag: 'ManageChannels', label: 'Manage Channels', weight: 5, critical: true },
  { flag: 'ManageWebhooks', label: 'Manage Webhooks', weight: 4, critical: true },
  { flag: 'KickMembers', label: 'Kick Members', weight: 3, critical: false },
  { flag: 'BanMembers', label: 'Ban Members', weight: 4, critical: false },
  { flag: 'ModerateMembers', label: 'Timeout Members', weight: 2, critical: false },
  { flag: 'MentionEveryone', label: 'Mention Everyone', weight: 2, critical: false },
  { flag: 'ManageMessages', label: 'Manage Messages', weight: 1, critical: false },
  { flag: 'ViewAuditLog', label: 'View Audit Log', weight: 2, critical: false },
  { flag: 'ManageEmojisAndStickers', label: 'Manage Expressions', weight: 1, critical: false }
];

function permissionLabel(flag) {
  const entry = DANGEROUS_PERMISSIONS.filter(function (item) { return item.flag === flag; })[0];
  return entry ? entry.label : flag;
}

function severityRank(severity) {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  if (severity === 'good') return 0;
  return 1;
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

async function runAudit(guild) {
  const findings = {
    roles: [],
    channels: [],
    integrations: [],
    server: []
  };

  let score = 100;
  const everyone = guild.roles.everyone;
  const botHighestRoleId = guild.members.me ? guild.members.me.roles.highest.id : null;
  const roles = guild.roles.cache.filter(function (role) {
    return role.id !== guild.id && role.id !== botHighestRoleId;
  });

  let dangerousRoles = 0;
  let adminRoles = 0;

  roles.forEach(function (role) {
    const held = DANGEROUS_PERMISSIONS.filter(function (item) {
      return role.permissions.has(PermissionsBitField.Flags[item.flag]);
    });

    if (held.length === 0) return;
    dangerousRoles++;
    if (role.permissions.has(PermissionsBitField.Flags.Administrator)) adminRoles++;

    const names = held.map(function (item) { return item.label; });
    const critical = held.some(function (item) { return item.critical; });
    findings.roles.push({
      label: role.name,
      detail: role.id + ' — ' + names.join(', ') + (role.managed ? ' (managed by an integration)' : ''),
      severity: critical ? 'critical' : 'warning',
      roleId: role.id
    });
  });

  if (everyone.permissions.has(PermissionsBitField.Flags.Administrator)) {
    findings.roles.unshift({
      label: '@everyone',
      detail: 'The @everyone role has Administrator. This is extremely dangerous.',
      severity: 'critical'
    });
  } else if (everyone.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    everyone.permissions.has(PermissionsBitField.Flags.BanMembers) ||
    everyone.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    findings.roles.unshift({
      label: '@everyone',
      detail: 'The @everyone role has moderation or server-management permissions.',
      severity: 'critical'
    });
  }

  const botMember = guild.members.me;
  if (botMember) {
    const botRole = botMember.roles.highest;
    const above = roles.filter(function (role) {
      return role.position >= botRole.position && role.id !== botRole.id;
    });
    above.forEach(function (role) {
      if (role.permissions.has(PermissionsBitField.Flags.Administrator) ||
        role.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
        role.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        findings.roles.push({
          label: role.name,
          detail: 'This role is above Zyron and can bypass or break its protections.',
          severity: 'warning',
          roleId: role.id
        });
      }
    });
  }

  const channels = guild.channels.cache;
  channels.forEach(function (channel) {
    if (!channel.permissionOverwrites) return;
    channel.permissionOverwrites.cache.forEach(function (overwrite) {
      if (!overwrite.allow) return;
      const dangerous = DANGEROUS_PERMISSIONS.filter(function (item) {
        return overwrite.allow.has(PermissionsBitField.Flags[item.flag]);
      });
      if (dangerous.length === 0) return;
      const target = overwrite.type === 0
        ? (guild.roles.cache.get(overwrite.id) ? guild.roles.cache.get(overwrite.id).name : overwrite.id)
        : (guild.members.cache.get(overwrite.id) ? guild.members.cache.get(overwrite.id).user.tag : overwrite.id);
      findings.channels.push({
        label: '#' + channel.name,
        detail: 'Grants ' + dangerous.map(function (item) { return item.label; }).join(', ') + ' to ' + target,
        severity: dangerous.some(function (item) { return item.critical; }) ? 'critical' : 'warning'
      });
    });
  });

  let webhooks = [];
  try {
    const fetched = await guild.fetchWebhooks();
    webhooks = Array.from(fetched.values());
  } catch (err) {
    webhooks = [];
  }
  webhooks.forEach(function (hook) {
    findings.integrations.push({
      label: hook.name || 'Unnamed webhook',
      detail: 'Webhook in ' + (hook.channel ? '#' + hook.channel.name : 'unknown channel') + (hook.owner ? ' owned by ' + hook.owner.tag : ''),
      severity: 'warning'
    });
  });

  let integrations = [];
  try {
    const fetched = await guild.fetchIntegrations();
    integrations = Array.from(fetched.values());
  } catch (err) {
    integrations = [];
  }
  integrations.forEach(function (integration) {
    findings.integrations.push({
      label: integration.name || integration.type,
      detail: 'Integration type: ' + integration.type + (integration.enabled === false ? ' (disabled)' : ''),
      severity: integration.enabled === false ? 'info' : 'warning'
    });
  });

  const bots = guild.members.cache.filter(function (member) { return member.user.bot; });
  findings.integrations.push({
    label: bots.size + ' bot account' + (bots.size === 1 ? '' : 's'),
    detail: bots.size > 0 ? bots.map(function (member) { return member.user.tag; }).slice(0, 15).join(', ') : 'No bots in the server.',
    severity: bots.size > 8 ? 'warning' : 'info'
  });

  const verificationNames = ['None', 'Low', 'Medium', 'High', 'Highest'];
  findings.server.push({
    label: 'Verification level',
    detail: verificationNames[guild.verificationLevel] || String(guild.verificationLevel),
    severity: guild.verificationLevel === 0 ? 'warning' : 'good'
  });
  findings.server.push({
    label: '2FA requirement for moderation',
    detail: guild.mfaLevel === 1 ? 'Enabled' : 'Disabled',
    severity: guild.mfaLevel === 1 ? 'good' : 'warning'
  });
  findings.server.push({
    label: 'Explicit content filter',
    detail: guild.explicitContentFilter === 2 ? 'All members' : (guild.explicitContentFilter === 1 ? 'Members without roles' : 'Disabled'),
    severity: guild.explicitContentFilter === 0 ? 'warning' : 'good'
  });
  findings.server.push({
    label: 'Members',
    detail: guild.memberCount + ' total • ' + roles.size + ' roles • ' + channels.size + ' channels',
    severity: 'info'
  });

  const criticalRoles = findings.roles.filter(function (item) { return item.severity === 'critical'; }).length;
  const warningRoles = findings.roles.filter(function (item) { return item.severity === 'warning'; }).length;
  const criticalChannels = findings.channels.filter(function (item) { return item.severity === 'critical'; }).length;

  score -= Math.min(35, criticalRoles * 9);
  score -= Math.min(18, warningRoles * 2);
  score -= Math.min(20, criticalChannels * 4);
  score -= Math.min(10, webhooks.length * 2);
  score -= Math.min(8, Math.max(0, bots.size - 5));
  if (guild.verificationLevel === 0) score -= 5;
  if (guild.mfaLevel === 0 && adminRoles > 3) score -= 5;
  if (integrations.length > 3) score -= 3;
  score = Math.max(0, Math.min(100, score));

  const categoryList = [
    {
      id: 'roles',
      title: 'Roles with danger permissions',
      severity: criticalRoles > 0 ? 'critical' : (warningRoles > 0 ? 'warning' : 'good'),
      summary: dangerousRoles + ' role(s) hold elevated permissions, including ' + adminRoles + ' with Administrator.',
      findings: findings.roles
    },
    {
      id: 'channels',
      title: 'Channel permission overwrites',
      severity: criticalChannels > 0 ? 'critical' : (findings.channels.length > 0 ? 'warning' : 'good'),
      summary: findings.channels.length + ' channel overwrite(s) grant elevated permissions.',
      findings: findings.channels
    },
    {
      id: 'integrations',
      title: 'Bots, webhooks and integrations',
      severity: findings.integrations.some(function (item) { return item.severity === 'critical'; })
        ? 'critical'
        : (findings.integrations.some(function (item) { return item.severity === 'warning'; }) ? 'warning' : 'good'),
      summary: bots.size + ' bot(s), ' + webhooks.length + ' webhook(s), ' + integrations.length + ' integration(s).',
      findings: findings.integrations
    },
    {
      id: 'server',
      title: 'Server settings',
      severity: findings.server.some(function (item) { return item.severity === 'warning'; }) ? 'warning' : 'good',
      summary: 'Verification, 2FA and content filtering health.',
      findings: findings.server
    }
  ];

  const recommendations = [];
  if (everyone.permissions.has(PermissionsBitField.Flags.Administrator)) {
    recommendations.push('Remove Administrator from @everyone immediately.');
  }
  if (adminRoles > 3) recommendations.push('Reduce the number of roles with Administrator. Use specific permissions instead.');
  if (criticalChannels > 0) recommendations.push('Review channel overwrites that grant Administrator or Manage Server.');
  if (webhooks.length > 5) recommendations.push('Audit webhooks and remove ones that are no longer used.');
  if (guild.verificationLevel === 0) recommendations.push('Raise the server verification level to at least Low.');
  if (guild.mfaLevel === 0) recommendations.push('Enable 2FA requirements for moderation actions.');
  if (recommendations.length === 0) recommendations.push('No urgent issues found. Keep reviewing permissions after staff changes.');

  return {
    guildId: guild.id,
    guildName: guild.name,
    generatedAt: Date.now(),
    score: score,
    grade: gradeFor(score),
    summary: {
      memberCount: guild.memberCount,
      roleCount: roles.size,
      dangerousRoles: dangerousRoles,
      adminRoles: adminRoles,
      botCount: bots.size,
      webhookCount: webhooks.length,
      integrationCount: integrations.length,
      channelFindings: findings.channels.length
    },
    categories: categoryList.sort(function (a, b) {
      return severityRank(b.severity) - severityRank(a.severity);
    }),
    recommendations: recommendations
  };
}

function buildEmbed(report) {
  const color = report.score >= 80
    ? config.colors.success
    : (report.score >= 60 ? config.colors.warning : config.colors.danger);

  const lines = report.categories.map(function (category) {
    const icon = category.severity === 'critical' ? '🔴' : (category.severity === 'warning' ? '🟠' : '🟢');
    return icon + ' **' + category.title + '** — ' + category.summary;
  });

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🩺 Server Health Report — ' + report.guildName)
    .setDescription(
      '**Security score:** **' + report.score + '/100** (Grade ' + report.grade + ')\n' +
      '**Members:** ' + report.summary.memberCount + ' • **Roles:** ' + report.summary.roleCount +
      ' • **Bots:** ' + report.summary.botCount + '\n\n' +
      lines.join('\n') + '\n\n' +
      '**Recommendations**\n' + report.recommendations.map(function (item) { return '• ' + item; }).join('\n')
    )
    .setFooter({ text: config.botName + ' Server Health' })
    .setTimestamp();
}

async function postReport(guild, settings, report) {
  const channelId = settings.serverAuditChannelId || settings.logChannel;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return false;

  const embed = buildEmbed(report);
  const critical = report.categories.filter(function (category) {
    return category.severity === 'critical';
  });

  if (critical.length > 0) {
    const fields = critical.slice(0, 5).map(function (category) {
      const findings = category.findings.slice(0, 5).map(function (item) {
        return '• **' + item.label + '** — ' + item.detail;
      });
      return {
        name: category.title,
        value: findings.join('\n').slice(0, 1024) || category.summary,
        inline: false
      };
    });
    embed.addFields(fields);
  }

  await channel.send({ embeds: [embed] }).catch(function () {});
  return true;
}

async function runAndStore(guild, settings, post) {
  const report = await runAudit(guild);
  const updated = db.updateGuild(guild.id, {
    serverAuditLastAt: report.generatedAt,
    serverAuditReport: report
  });
  if (post) await postReport(guild, updated, report);
  return report;
}

function start(client) {
  if (timer) return;

  timer = setInterval(async function () {
    try {
      for (const guild of client.guilds.cache.values()) {
        const settings = db.getGuild(guild.id);
        if (!settings.serverAuditEnabled) continue;

        const intervalMs = Math.max(1, Number(settings.serverAuditIntervalHours) || 24) * 60 * 60 * 1000;
        const lastAt = Number(settings.serverAuditLastAt) || 0;
        if (lastAt && Date.now() - lastAt < intervalMs) continue;
        if (!lastAt) {
          db.updateGuild(guild.id, { serverAuditLastAt: Date.now() });
          continue;
        }

        await runAndStore(guild, settings, true);
      }
    } catch (err) {
      console.error('Scheduled server audit failed:', err.message);
    }
  }, 5 * 60 * 1000);

  if (timer.unref) timer.unref();
}

module.exports = {
  DANGEROUS_PERMISSIONS,
  runAudit,
  runAndStore,
  postReport,
  buildEmbed,
  start
};
