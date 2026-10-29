const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function footer() {
  return { text: config.botName + ' | Powered by ' + config.company };
}

async function safeDM(user, payload) {
  try {
    if (!user) return false;
    await user.send(payload);
    return true;
  } catch (err) {
    return false;
  }
}

async function dmWarning(memberOrUser, data) {
  if (!memberOrUser) return false;
  const user = memberOrUser.user || memberOrUser;
  const guild = data.guild || memberOrUser.guild;
  if (!guild) return false;
  const settings = db.getGuild(guild.id);
  const threshold = data.threshold || settings.warningKickThreshold || 5;
  const count = data.count || 1;
  if (settings.dmWarnings === false) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.warning || '#FEE75C')
    .setTitle('⚠️ Warning Received')
    .setDescription(
      'You received a warning in **' + guild.name + '**.\n\n' +
      '**Reason:** ' + (data.reason || 'Not specified') + '\n' +
      '**Warning:** ' + count + ' / ' + threshold + '\n\n' +
      (count + 1 >= threshold
        ? 'One more warning will result in a kick. You can appeal if action is taken.'
        : 'Keep following the server rules to avoid a kick.')
    )
    .setFooter(footer())
    .setTimestamp();

  return safeDM(user, { embeds: [embed] });
}

async function dmTicketOpen(member, ticket, channel, guild) {
  if (!member) return false;
  const settings = db.getGuild(guild.id);
  if (settings.dmTicketUpdates === false) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎫 Ticket Opened')
    .setDescription(
      'Your ticket **#' + ticket.number + '** has been created in **' + guild.name + '**.\n\n' +
      '**Type:** ' + (ticket.type || 'General') + '\n' +
      '**Reason:** ' + (ticket.reason || 'Not specified') + '\n' +
      '**Channel:** ' + (channel ? '<#' + channel.id + '>' : 'N/A')
    )
    .setFooter(footer())
    .setTimestamp();

  return safeDM(member.user, { embeds: [embed] });
}

async function dmTicketClose(member, ticket, guild, closedByTag) {
  if (!member) return false;
  const settings = db.getGuild(guild.id);
  if (settings.dmTicketUpdates === false) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🎫 Ticket Closed')
    .setDescription(
      'Your ticket **#' + ticket.number + '** in **' + guild.name + '** has been closed.\n\n' +
      '**Closed by:** ' + (closedByTag || 'Staff') + '\n' +
      '**Reason:** ' + (ticket.closeReason || 'Resolved') + '\n\n' +
      'A transcript has been attached to this conversation. Please rate your experience below.'
    )
    .setFooter(footer())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feedback:rate:' + ticket.id)
      .setLabel('Rate Support')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⭐')
  );

  return safeDM(member.user, { embeds: [embed], components: [row] });
}

async function dmSecurityAction(member, data) {
  if (!member) return false;
  const settings = db.getGuild(member.guild.id);
  if (settings.dmSecurity === false) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.danger || '#ED4245')
    .setTitle('🛡️ Security Action')
    .setDescription(
      'A security action was taken on your account in **' + member.guild.name + '**.\n\n' +
      '**Action:** ' + (data.action || 'Moderation') + '\n' +
      '**Reason:** ' + (data.reason || 'Security policy violation') + '\n\n' +
      'If you believe this is a mistake, use the appeals system.'
    )
    .setFooter(footer())
    .setTimestamp();

  return safeDM(member.user, { embeds: [embed] });
}

async function dmAppealResult(user, guild, data) {
  if (!user) return false;

  const embed = new EmbedBuilder()
    .setColor(data.approved ? config.colors.success || '#57F287' : config.colors.danger || '#ED4245')
    .setTitle(data.approved ? '✅ Appeal Approved' : '❌ Appeal Denied')
    .setDescription(
      'Your appeal in **' + guild.name + '** has been **' + (data.approved ? 'approved' : 'denied') + '**.\n\n' +
      (data.message ? '**Staff note:** ' + data.message + '\n\n' : '') +
      (data.approved ? 'You may rejoin using the invite provided by our staff.' : 'You may appeal again after the cooldown period.')
    )
    .setFooter(footer())
    .setTimestamp();

  const payload = { embeds: [embed] };
  if (data.approved && data.invite) {
    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Rejoin Server')
          .setStyle(ButtonStyle.Link)
          .setURL(data.invite)
      )
    ];
  }

  return safeDM(user, payload);
}

async function dmVerification(member, rules, guild) {
  if (!member) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🔐 Verify to Access ' + guild.name)
    .setDescription(String(rules || 'Please accept the server rules to gain access.').slice(0, 4000))
    .setFooter(footer())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:accept:' + guild.id)
      .setLabel('I Accept the Rules')
      .setStyle(ButtonStyle.Success)
  );

  return safeDM(member.user, { embeds: [embed], components: [row] });
}

async function dmFeedbackPrompt(member, guild, data) {
  if (!member) return false;
  const settings = db.getGuild(guild.id);
  if (settings.dmFeedback === false) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('💬 How did we do?')
    .setDescription(
      'Thanks for using **' + guild.name + '** support!\n\n' +
      (data.context ? data.context + '\n\n' : '') +
      'Please take a moment to rate your experience.'
    )
    .setFooter(footer())
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('feedback:rate:' + (data.id || 'general'))
      .setLabel('Rate Experience')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⭐')
  );

  return safeDM(member.user, { embeds: [embed], components: [row] });
}

module.exports = {
  safeDM,
  dmWarning,
  dmTicketOpen,
  dmTicketClose,
  dmSecurityAction,
  dmAppealResult,
  dmVerification,
  dmFeedbackPrompt
};
