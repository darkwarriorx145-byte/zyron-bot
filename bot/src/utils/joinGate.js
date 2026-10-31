const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const protection = require('./protection');
const security = require('./security');
const inviteLogger = require('./inviteLogger');

const RISK_LABELS = {
  newAccount: 'Very new Discord account',
  youngAccount: 'Recently created account',
  defaultAvatar: 'Default avatar',
  suspiciousName: 'Suspicious username pattern',
  joinBurst: 'Joining during a join burst',
  priorWarning: 'Previous moderation warning',
  fakeInvite: 'Flagged invite source',
  noAvatar: 'No custom avatar'
};

function ensureGuild(guildId) {
  if (!db.data.joinGateEvents) db.data.joinGateEvents = {};
  if (!db.data.joinGateChallenges) db.data.joinGateChallenges = {};
  if (!Array.isArray(db.data.joinGateEvents[guildId])) db.data.joinGateEvents[guildId] = [];
  if (!db.data.joinGateChallenges[guildId]) db.data.joinGateChallenges[guildId] = {};
  return db.data.joinGateEvents[guildId];
}

function recordEvent(guildId, payload) {
  const events = ensureGuild(guildId);
  const event = Object.assign({
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    createdAt: Date.now(),
    resolvedAt: null,
    resolvedBy: null
  }, payload);
  events.push(event);
  if (events.length > 500) db.data.joinGateEvents[guildId] = events.slice(-300);
  db.save();
  return event;
}

function updateEvent(guildId, eventId, updates) {
  const events = ensureGuild(guildId);
  const event = events.filter(function (item) { return item.id === eventId; })[0];
  if (!event) return null;
  Object.assign(event, updates || {});
  db.save();
  return event;
}

function findPendingEvent(guildId, userId) {
  const events = ensureGuild(guildId);
  return events.slice().reverse().filter(function (event) {
    return event.userId === userId && (event.status === 'pending' || event.status === 'flagged');
  })[0] || null;
}

function isBypassed(guild, member, settings) {
  if (!member || !member.user) return true;
  if (member.user.bot) return true;
  if (protection.isProtectedUser(member.id)) return true;
  if (db.isWhitelisted(guild.id, member.id)) return true;
  if (db.isFeatureWhitelisted(guild.id, 'joinGate', member.id)) return true;
  if (guild.ownerId === member.id) return true;
  if (member.permissions && member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
  return false;
}

function addFactor(factors, key, points) {
  factors.push({ key: key, label: RISK_LABELS[key] || key, points: points });
}

function assessRisk(guild, member, settings) {
  const factors = [];
  const created = member.user.createdTimestamp || Date.now();
  const ageDays = Math.max(0, (Date.now() - created) / 86400000);
  const minAge = Math.max(0, Number(settings.joinGateMinAccountAgeDays) || 0);

  if (ageDays < 1) addFactor(factors, 'newAccount', 45);
  else if (ageDays < Math.max(7, minAge)) addFactor(factors, 'youngAccount', 25);
  else if (ageDays < 30) addFactor(factors, 'youngAccount', 10);

  if (!member.user.avatar) addFactor(factors, 'defaultAvatar', 15);

  const username = String(member.user.username || '');
  if (/(user|guest|alt|test|throwaway)[-_]?\d{2,}/i.test(username) || /^\d{6,}$/.test(username)) {
    addFactor(factors, 'suspiciousName', 12);
  }

  let recentJoins = [];
  try {
    recentJoins = security.getRecentJoins(guild.id, 60000) || [];
  } catch (err) {
    recentJoins = [];
  }
  if (recentJoins.length >= 10) addFactor(factors, 'joinBurst', 30);
  else if (recentJoins.length >= 5) addFactor(factors, 'joinBurst', 16);

  if (db.getWarnings(guild.id, member.id).length > 0) addFactor(factors, 'priorWarning', 18);

  const inviteRecord = db.getInviteRecord(guild.id, member.id);
  if (inviteRecord && inviteRecord.fake) addFactor(factors, 'fakeInvite', 20);

  const score = Math.max(0, Math.min(100, factors.reduce(function (sum, factor) {
    return sum + factor.points;
  }, 0)));

  return {
    score: score,
    factors: factors,
    accountAgeDays: Math.round(ageDays * 10) / 10,
    recentJoins: recentJoins.length
  };
}

function verificationRoleIds(settings) {
  const ids = [settings.verificationRole].concat(Array.isArray(settings.verificationRoles) ? settings.verificationRoles : []);
  return ids.filter(function (id, index) {
    return id && ids.indexOf(id) === index;
  });
}

async function addRole(member, roleId, reason) {
  if (!roleId) return false;
  const role = member.guild.roles.cache.get(roleId);
  if (!role || !role.editable) return false;
  return member.roles.add(role, reason).then(function () { return true; }).catch(function () { return false; });
}

async function removeRole(member, roleId, reason) {
  if (!roleId) return false;
  const role = member.guild.roles.cache.get(roleId);
  if (!role || !role.editable) return false;
  return member.roles.remove(role, reason).then(function () { return true; }).catch(function () { return false; });
}

function logChannel(guild, settings) {
  const channelId = settings.joinGateLogChannelId || settings.verificationLogChannel || settings.logChannel;
  return channelId ? guild.channels.cache.get(channelId) : null;
}

function sendLog(guild, settings, embed) {
  const channel = logChannel(guild, settings);
  if (channel) channel.send({ embeds: [embed] }).catch(function () {});
}

function eventEmbed(guild, member, risk, status, action) {
  const factorText = risk.factors.length
    ? risk.factors.map(function (factor) { return '• ' + factor.label + ' (+' + factor.points + ')'; }).join('\n')
    : 'No risk factors detected.';
  return new EmbedBuilder()
    .setColor(risk.score >= 60 ? config.colors.danger : (risk.score >= 30 ? config.colors.warning : config.colors.success))
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setTitle('Join Gate — ' + String(status || 'checked').replace(/_/g, ' '))
    .setDescription('<@' + member.id + '> joined **' + guild.name + '**.\n\n**Risk score:** ' + risk.score + '/100\n' + factorText)
    .addFields(
      { name: 'Account age', value: risk.accountAgeDays + ' days', inline: true },
      { name: 'Action', value: String(action || 'none'), inline: true }
    )
    .setFooter({ text: config.botName + ' Join Gate | Powered by ' + config.company })
    .setTimestamp();
}

function challengeQuestion() {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  const useMultiply = Math.random() < 0.45;
  return {
    question: 'What is ' + left + ' ' + (useMultiply ? 'x' : '+') + ' ' + right + '?',
    answer: String(useMultiply ? left * right : left + right)
  };
}

function challengeEmbed(member, challenge) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('Join Gate — Quick check')
    .setDescription(
      'Welcome to **' + member.guild.name + '**, <@' + member.id + '>.\n\n' +
      'Before you can access the server, complete this quick human check.\n\n' +
      '**' + challenge.question + '**\n\n' +
      'Click the button below and enter your answer. This challenge expires in 15 minutes.'
    )
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();
}

function challengeRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('joingate:challenge:' + guildId)
      .setLabel('Complete check')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛡️')
  );
}

async function sendChallenge(guild, member, settings, risk, joinEvent) {
  const challenge = challengeQuestion();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  if (!db.data.joinGateChallenges[guild.id]) db.data.joinGateChallenges[guild.id] = {};
  db.data.joinGateChallenges[guild.id][member.id] = {
    question: challenge.question,
    answer: challenge.answer,
    createdAt: Date.now(),
    expiresAt: expiresAt
  };
  db.save();

  const embed = challengeEmbed(member, challenge);
  const row = challengeRow(guild.id);

  let sent = false;
  try {
    await member.send({ embeds: [embed], components: [row] });
    sent = true;
  } catch (err) {
    sent = false;
  }

  const channelId = settings.joinGateChallengeChannelId || settings.verificationChannel;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (channel) {
    channel.send({
      content: '<@' + member.id + '>',
      embeds: [embed],
      components: [row]
    }).catch(function () {});
    sent = true;
  }

  if (sent && joinEvent) {
    updateEvent(guild.id, joinEvent.id, {
      status: 'pending',
      action: 'challenge_sent'
    });
  } else if (sent) {
    recordEvent(guild.id, {
      userId: member.id,
      username: member.user.tag,
      type: 'join',
      score: risk.score,
      factors: risk.factors,
      status: 'pending',
      action: 'challenge_sent'
    });
  }

  sendLog(guild, settings, eventEmbed(guild, member, risk, 'challenge sent', 'challenge'));
  return { sent: sent, expiresAt: expiresAt, question: challenge.question };
}

async function handleMemberJoin(member, settings) {
  if (!settings || !settings.joinGateEnabled) return null;
  if (!member || !member.guild) return null;
  if (isBypassed(member.guild, member, settings)) return null;

  const risk = assessRisk(member.guild, member, settings);
  const highRisk = risk.score >= Math.max(0, Number(settings.joinGateRiskThreshold) || 60);
  const action = String(settings.joinGateHighRiskAction || 'quarantine').toLowerCase();

  const joinEvent = recordEvent(member.guild.id, {
    userId: member.id,
    username: member.user.tag,
    type: 'join',
    score: risk.score,
    factors: risk.factors,
    status: highRisk ? 'flagged' : 'passed',
    action: 'none'
  });

  if (highRisk && action === 'kick') {
    await member.kick('Join Gate: risk score ' + risk.score).catch(function () {});
    updateEvent(member.guild.id, joinEvent.id, {
      status: 'kicked',
      action: 'kick',
      resolvedAt: Date.now(),
      resolvedBy: 'join gate'
    });
    sendLog(member.guild, settings, eventEmbed(member.guild, member, risk, 'high risk — kicked', 'kick'));
    return { risk: risk, action: 'kick', challenge: false };
  }

  let challenged = false;
  if (settings.joinGateChallengeEnabled) {
    await addRole(member, settings.joinGateQuarantineRoleId, 'Join Gate: pending verification');
    const challenge = await sendChallenge(member.guild, member, settings, risk, joinEvent);
    challenged = Boolean(challenge && challenge.sent);
  } else if (highRisk && action === 'quarantine') {
    await addRole(member, settings.joinGateQuarantineRoleId, 'Join Gate: staff review');
    updateEvent(member.guild.id, joinEvent.id, { status: 'flagged', action: 'quarantine' });
    sendLog(member.guild, settings, eventEmbed(member.guild, member, risk, 'high risk — quarantined', 'quarantine'));
  } else if (highRisk) {
    updateEvent(member.guild.id, joinEvent.id, { action: 'log' });
    sendLog(member.guild, settings, eventEmbed(member.guild, member, risk, 'high risk — logged', 'log'));
  }

  if (!challenged && highRisk && action === 'quarantine' && joinEvent.status !== 'flagged') {
    updateEvent(member.guild.id, joinEvent.id, { status: 'flagged', action: 'quarantine' });
  }

  return { risk: risk, action: challenged ? 'challenge' : (highRisk ? action : 'none'), challenge: challenged };
}

async function completeGate(guild, member, settings, via) {
  await removeRole(member, settings.joinGateQuarantineRoleId, 'Join Gate: passed');

  const roleIds = verificationRoleIds(settings);
  const editable = roleIds.map(function (id) { return guild.roles.cache.get(id); })
    .filter(function (role) { return role && role.editable; })
    .map(function (role) { return role.id; });
  if (editable.length > 0) {
    await member.roles.add(editable, 'Join Gate: ' + (via || 'challenge passed')).catch(function () {});
  } else if (settings.autoRoleId) {
    await addRole(member, settings.autoRoleId, 'Join Gate: passed');
  }

  if (db.data.joinGateChallenges[guild.id]) delete db.data.joinGateChallenges[guild.id][member.id];

  const pending = findPendingEvent(guild.id, member.id);
  if (pending) updateEvent(guild.id, pending.id, {
    status: 'verified',
    action: 'verified',
    resolvedAt: Date.now(),
    resolvedBy: via || 'challenge'
  });

  try {
    await inviteLogger.countVerifiedInvite(guild, member, settings);
  } catch (err) {
    console.error('Join Gate invite count failed for ' + member.id + ':', err.message);
  }

  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('✅ Join Gate Passed')
    .setDescription('You can now access **' + guild.name + '**. Welcome!')
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();
  member.send({ embeds: [embed] }).catch(function () {});

  sendLog(guild, settings, new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('Join Gate Passed')
    .setDescription('<@' + member.id + '> passed the join gate via **' + (via || 'challenge') + '**.')
    .setTimestamp());

  return true;
}

async function handleChallengeButton(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server not found.', ephemeral: true });

  const settings = db.getGuild(guildId);
  if (!settings.joinGateEnabled) return interaction.reply({ content: 'The join gate is not active.', ephemeral: true });

  const store = db.data.joinGateChallenges[guildId] || {};
  const challenge = store[interaction.user.id];
  if (!challenge) {
    return interaction.reply({ content: 'No active challenge was found. Ask server staff for help.', ephemeral: true });
  }
  if (challenge.expiresAt < Date.now()) {
    delete store[interaction.user.id];
    db.save();
    return interaction.reply({ content: 'This challenge expired. Ask server staff to resend it.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('joingate:answer:' + guildId)
    .setTitle('Join Gate Check');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('answer')
        .setLabel(challenge.question.slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setPlaceholder('Enter the answer')
    )
  );
  return interaction.showModal(modal);
}

async function handleChallengeSubmit(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server not found.', ephemeral: true });

  const settings = db.getGuild(guildId);
  const member = await guild.members.fetch(interaction.user.id).catch(function () { return null; });
  if (!member) return interaction.reply({ content: 'You are not in this server.', ephemeral: true });

  const store = db.data.joinGateChallenges[guildId] || {};
  const challenge = store[interaction.user.id];
  if (!challenge) return interaction.reply({ content: 'This challenge is no longer active.', ephemeral: true });
  if (challenge.expiresAt < Date.now()) {
    delete store[interaction.user.id];
    db.save();
    return interaction.reply({ content: 'This challenge expired. Ask server staff to resend it.', ephemeral: true });
  }

  const answer = String(interaction.fields.getTextInputValue('answer') || '').trim();
  if (answer !== challenge.answer) {
    challenge.attempts = (challenge.attempts || 0) + 1;
    db.save();
    const pending = findPendingEvent(guildId, interaction.user.id);
    if (pending) updateEvent(guildId, pending.id, {
      status: 'flagged',
      action: 'challenge_failed',
      attempts: challenge.attempts
    });
    sendLog(guild, settings, new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('Join Gate — Wrong Answer')
      .setDescription('<@' + interaction.user.id + '> answered the challenge incorrectly (' + challenge.attempts + ' attempt' + (challenge.attempts === 1 ? '' : 's') + ').')
      .setTimestamp());
    return interaction.reply({ content: 'That answer was not correct. Try again.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true }).catch(function () {});
  await completeGate(guild, member, settings, 'challenge');
  return interaction.editReply({ content: '✅ Check passed. You can now access the server.' }).catch(function () {});
}

async function handleHoneypot(message, settings) {
  if (!settings || !settings.joinGateEnabled || !settings.joinGateHoneypotChannelId) return false;
  if (!message.guild || !message.member || message.author.bot) return false;
  if (message.channel.id !== settings.joinGateHoneypotChannelId) return false;
  if (isBypassed(message.guild, message.member, settings)) return false;

  const action = String(settings.joinGateHoneypotAction || 'timeout').toLowerCase();
  let applied = 'timeout';
  try {
    if (action === 'ban') {
      await message.member.ban({ reason: 'Join Gate: triggered honeypot channel' });
      applied = 'ban';
    } else if (action === 'kick') {
      await message.member.kick('Join Gate: triggered honeypot channel');
      applied = 'kick';
    } else {
      await message.member.timeout(10 * 60 * 1000, 'Join Gate: triggered honeypot channel');
      applied = 'timeout';
    }
  } catch (err) {
    applied = 'failed: ' + err.message;
  }

  recordEvent(message.guild.id, {
    userId: message.author.id,
    username: message.author.tag,
    type: 'honeypot',
    score: 100,
    factors: [{ key: 'honeypot', label: 'Posted in the honeypot channel', points: 100 }],
    status: 'blocked',
    action: applied
  });

  sendLog(message.guild, settings, new EmbedBuilder()
    .setColor(config.colors.danger)
    .setTitle('🍯 Join Gate — Honeypot Triggered')
    .setDescription('<@' + message.author.id + '> posted in <#' + message.channel.id + '>.\n\n**Action:** ' + applied)
    .addFields({ name: 'Message', value: String(message.content || '(no text)').slice(0, 1000) })
    .setTimestamp());

  message.delete().catch(function () {});
  return true;
}

async function resolveEvent(guild, settings, eventId, action, actorId) {
  const events = ensureGuild(guild.id);
  const event = events.filter(function (item) { return item.id === eventId; })[0];
  if (!event) throw new Error('Join gate event not found.');

  const member = await guild.members.fetch(event.userId).catch(function () { return null; });
  if (!member) throw new Error('That member is no longer in this server.');

  if (action === 'release') {
    await completeGate(guild, member, settings, 'staff release');
    updateEvent(guild.id, eventId, {
      status: 'released',
      action: 'released',
      resolvedAt: Date.now(),
      resolvedBy: actorId || null
    });
  } else if (action === 'kick') {
    await member.kick('Join Gate: kicked by staff ' + (actorId || ''));
    updateEvent(guild.id, eventId, {
      status: 'kicked',
      action: 'kick',
      resolvedAt: Date.now(),
      resolvedBy: actorId || null
    });
  } else {
    throw new Error('Invalid join gate action.');
  }

  return getStatus(guild.id);
}

function getStatus(guildId) {
  const events = ensureGuild(guildId).slice().reverse();
  const stats = {
    total: events.filter(function (event) { return event.type === 'join'; }).length,
    pending: events.filter(function (event) { return event.status === 'pending' || event.status === 'flagged'; }).length,
    verified: events.filter(function (event) { return event.status === 'verified' || event.status === 'released'; }).length,
    blocked: events.filter(function (event) { return event.status === 'kicked' || event.status === 'blocked'; }).length,
    honeypot: events.filter(function (event) { return event.type === 'honeypot'; }).length
  };
  return {
    stats: stats,
    events: events.slice(0, 50)
  };
}

module.exports = {
  handleMemberJoin,
  handleChallengeButton,
  handleChallengeSubmit,
  handleHoneypot,
  resolveEvent,
  getStatus,
  findPendingEvent,
  assessRisk,
  isBypassed
};
