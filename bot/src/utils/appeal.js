const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

const P = PermissionsBitField.Flags;

function findLogChannel(guild, settings) {
  if (!guild) return null;
  if (settings && settings.logChannel) {
    const configured = guild.channels.cache.get(settings.logChannel);
    if (configured) return configured;
  }
  return guild.channels.cache.find(function (channel) {
    return channel && channel.name === 'zyron-logs' && channel.isTextBased();
  }) || null;
}

function caseEmbed(guild, appeal, title, color) {
  const answers = appeal.answers || {};
  const fields = [
    { name: 'Member', value: '<@' + appeal.userId + '>\n' + String(appeal.userId), inline: true },
    { name: 'Case', value: String(appeal.id), inline: true },
    { name: 'Status', value: String(appeal.status || 'pending').toUpperCase(), inline: true },
    { name: 'Action', value: String(appeal.actionTaken || appeal.action || 'Kicked'), inline: true },
    { name: 'Warnings', value: String(appeal.warnings || 0), inline: true },
    { name: 'Reason', value: String(appeal.reason || 'No reason provided').slice(0, 1024), inline: false }
  ];

  if (answers.apology) {
    fields.push({ name: 'Did they apologize?', value: String(answers.apology).slice(0, 1024), inline: true });
  }
  if (answers.whatHappened) {
    fields.push({ name: 'What happened?', value: String(answers.whatHappened).slice(0, 1024), inline: false });
  }
  if (answers.whyUnban) {
    fields.push({ name: 'Why should we approve?', value: String(answers.whyUnban).slice(0, 1024), inline: false });
  }
  if (appeal.reviewedBy) {
    fields.push({ name: 'Reviewed by', value: '<@' + appeal.reviewedBy + '>', inline: true });
  }
  if (appeal.inviteUrl) {
    fields.push({ name: 'Invite sent', value: String(appeal.inviteUrl).slice(0, 1024), inline: false });
  }

  return new EmbedBuilder()
    .setColor(color || config.colors.primary)
    .setTitle(title)
    .addFields(fields)
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();
}

async function sendLog(guild, settings, appeal, title, color) {
  const channel = findLogChannel(guild, settings);
  if (!channel) return null;
  return channel.send({ embeds: [caseEmbed(guild, appeal, title, color)] }).catch(function (err) {
    console.error('Appeal log error:', err.message);
    return null;
  });
}

async function sendAppealDM(guild, appeal) {
  if (!guild || !appeal.userId) return false;
  try {
    const user = await guild.client.users.fetch(appeal.userId);
    const action = String(appeal.actionTaken || appeal.action || 'kicked');
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('You were ' + (action.indexOf('ban') !== -1 ? 'banned' : 'kicked') + ' from ' + guild.name)
      .setDescription(
        'You have been **' + action + '** from **' + guild.name + '**.\n\n' +
        '**Reason:** ' + String(appeal.reason || 'No reason provided').slice(0, 1000) + '\n\n' +
        'If you apologize for your mistake, click the button below and answer every question. ' +
        'All appeal questions are required.\n\n' +
        'A staff member will review your appeal. If it is approved, Zyron will DM you a fresh invite link.'
      )
      .setFooter({ text: config.botName + ' | Powered by ' + config.company })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('appeal:start:' + guild.id + ':' + appeal.id)
        .setLabel('Appeal / Apologize')
        .setStyle(ButtonStyle.Primary)
    );

    await user.send({ embeds: [embed], components: [row] });
    return true;
  } catch (err) {
    console.error('Appeal DM failed for ' + appeal.userId + ':', err.message);
    return false;
  }
}

async function createAppealCase(guild, settings, userId, data) {
  const info = data || {};
  const appeal = db.addAppeal(guild.id, {
    userId: userId,
    action: info.action || 'kick',
    actionTaken: info.actionTaken || 'Kicked from the server',
    reason: info.reason || 'No reason provided',
    warnings: info.warnings || 0,
    type: info.type || 'minor',
    channelId: info.channelId || null
  });

  await sendLog(guild, settings, appeal, 'Appeal Case Opened', config.colors.warning);
  await sendAppealDM(guild, appeal);
  return appeal;
}

async function createInvite(guild, settings) {
  const candidates = [];
  if (settings && settings.appealInviteChannel) {
    const configured = guild.channels.cache.get(settings.appealInviteChannel);
    if (configured) candidates.push(configured);
  }

  [settings && settings.ticketLogChannel, settings && settings.logChannel, guild.systemChannelId].forEach(function (id) {
    if (!id) return;
    const channel = guild.channels.cache.get(id);
    if (channel && candidates.indexOf(channel) === -1) candidates.push(channel);
  });

  guild.channels.cache.forEach(function (channel) {
    if (candidates.length >= 8) return;
    if (!channel || !channel.isTextBased()) return;
    if (channel.type !== 0 && channel.type !== 5) return;
    if (candidates.indexOf(channel) === -1) candidates.push(channel);
  });

  const me = guild.members.me;
  for (let i = 0; i < candidates.length; i++) {
    const channel = candidates[i];
    if (!me || !channel.permissionsFor(me).has(P.CreateInstantInvite)) continue;
    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 1,
      unique: true,
      reason: 'Zyron appeal approved'
    }).catch(function () {
      return null;
    });
    if (invite) return 'https://discord.gg/' + invite.code;
  }

  return null;
}

async function reviewAppeal(guild, settings, caseId, action, reviewerId) {
  const appeal = db.getAppeal(guild.id, caseId);
  if (!appeal) throw new Error('Appeal not found.');
  if (appeal.status !== 'pending') throw new Error('This appeal was already reviewed.');

  const approved = String(action).toLowerCase() === 'approve';
  const user = await guild.client.users.fetch(appeal.userId).catch(function () {
    return null;
  });

  if (approved) {
    const inviteUrl = await createInvite(guild, settings);
    const banned = await guild.bans.fetch(appeal.userId).catch(function () {
      return null;
    });
    if (banned) {
      await guild.bans.remove(appeal.userId, 'Zyron appeal approved').catch(function () {});
    }
    db.clearWarnings(guild.id, appeal.userId);

    if (user) {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('Appeal Approved')
            .setDescription(
              'Your appeal in **' + guild.name + '** was approved.\n\n' +
              (inviteUrl
                ? 'Use this invite to rejoin: ' + inviteUrl + '\n\nThis invite is generated by Zyron and works once.'
                : 'You can rejoin with a normal server invite. Ask a staff member if you need one.')
            )
            .setFooter({ text: config.botName + ' | Powered by ' + config.company })
            .setTimestamp()
        ]
      }).catch(function () {});
    }

    const updated = db.updateAppeal(guild.id, caseId, {
      status: 'approved',
      reviewedBy: reviewerId || null,
      reviewedAt: Date.now(),
      inviteUrl: inviteUrl
    });

    await sendLog(guild, settings, updated, 'Appeal Approved', config.colors.success);
    return updated;
  }

  if (user) {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('Appeal Declined')
          .setDescription(
            'Your appeal in **' + guild.name + '** was declined.\n\n' +
            'You will not receive an invite link. You may apply again in the future if the server allows it.'
          )
          .setFooter({ text: config.botName + ' | Powered by ' + config.company })
          .setTimestamp()
      ]
    }).catch(function () {});
  }

  const updated = db.updateAppeal(guild.id, caseId, {
    status: 'denied',
    reviewedBy: reviewerId || null,
    reviewedAt: Date.now()
  });

  await sendLog(guild, settings, updated, 'Appeal Declined', config.colors.danger);
  return updated;
}

module.exports = {
  createAppealCase: createAppealCase,
  sendAppealDM: sendAppealDM,
  sendLog: sendLog,
  reviewAppeal: reviewAppeal,
  caseEmbed: caseEmbed,
  findLogChannel: findLogChannel
};
