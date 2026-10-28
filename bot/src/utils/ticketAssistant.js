const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const aiGuard = require('./aiGuard');
const config = require('../../config.json');

const P = PermissionsBitField.Flags;

function roleIds(settings) {
  const ids = [];
  const add = function (id) {
    const value = String(id || '').trim();
    if (value && /^\d{15,25}$/.test(value) && ids.indexOf(value) === -1) ids.push(value);
  };
  add(settings && settings.ticketStaffRole);
  (settings && Array.isArray(settings.ticketStaffRoles) ? settings.ticketStaffRoles : []).forEach(add);
  (settings && Array.isArray(settings.staffApplyAcceptRoles) ? settings.staffApplyAcceptRoles : []).forEach(add);
  add(settings && settings.staffApplyAcceptRole);
  return ids;
}

function isTicketStaff(member, settings) {
  if (!member) return false;
  if (member.permissions.has(P.ManageGuild)) return true;
  if (member.permissions.has(P.ManageChannels)) return true;
  const ids = roleIds(settings);
  return ids.some(function (id) {
    return member.roles.cache.has(id);
  });
}

function systemPrompt() {
  return [
    'You are Zyron AI Support, a friendly Discord ticket assistant.',
    'Help the member explain and solve their issue in short, clear messages.',
    'Ask one useful follow-up question when important details are missing.',
    'You may explain common steps, ask for screenshots, or suggest what staff should check.',
    'Never pretend to be a human. Never promise refunds, bans, appeals, or staff decisions.',
    'If the issue needs a human decision, say a staff member will review it.',
    'Keep replies under 130 words. Use plain text, no markdown headings, no code fences.'
  ].join('\n');
}

function fallbackReply(reason) {
  const text = String(reason || '').trim();
  return [
    'Thanks for opening this ticket. I have noted your request:',
    text ? '"' + text.slice(0, 500) + '"' : 'No reason was provided.',
    '',
    'Please add any screenshots, user IDs, or error messages that can help us understand the issue. A staff member can take over at any time.'
  ].join('\n');
}

async function callAi(settings, prompt) {
  if (!settings || settings.ticketAiEnabled === false || settings.aiEnabled === false) return null;
  if (!aiGuard.isConfigured()) return null;
  const result = await aiGuard.chat(settings, systemPrompt(), prompt);
  if (!result || !result.ok || !result.text) return null;
  return String(result.text).trim().slice(0, 1800);
}

async function firstReply(info) {
  const data = info || {};
  const reason = String(data.reason || '').slice(0, 1200);
  const fallback = fallbackReply(reason);
  const prompt = [
    'A new ticket was just opened.',
    'Server: ' + String(data.guild && data.guild.name ? data.guild.name : 'Discord server'),
    'Ticket type: ' + String(data.type || 'General Support'),
    'Member: ' + String(data.user && data.user.tag ? data.user.tag : 'member'),
    'Reason given by the member: ' + reason,
    '',
    'Write the first support reply. Acknowledge the issue, give one useful next step, and ask for any missing detail.'
  ].join('\n');

  const reply = await callAi(data.settings, prompt);
  return reply || fallback;
}

async function replyToMessage(info) {
  const data = info || {};
  const content = String(data.message || '').slice(0, 1200);
  const history = Array.isArray(data.history) ? data.history.slice(-8) : [];
  const lines = history.map(function (entry) {
    return String(entry.author || 'member') + ': ' + String(entry.content || '').slice(0, 500);
  });

  const prompt = [
    'Ticket type: ' + String(data.type || 'General Support'),
    'Original reason: ' + String(data.reason || 'not provided').slice(0, 800),
    'Member: ' + String(data.user && data.user.tag ? data.user.tag : 'member'),
    '',
    'Recent ticket messages:',
    lines.length ? lines.join('\n') : 'No earlier messages.',
    '',
    'New message from the member: ' + content,
    '',
    'Reply to the member with helpful support. Ask one follow-up question if needed.'
  ].join('\n');

  return await callAi(data.settings, prompt);
}

function handledEmbed(staffUser) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('Handled by staff')
    .setDescription(
      String(staffUser || 'A staff member') + ' is now handling this ticket.\n\n' +
      'If you want to continue with the AI assistant instead, click the button below.'
    )
    .setFooter({ text: config.botName + ' | Powered by ' + config.company });
}

module.exports = {
  roleIds: roleIds,
  isTicketStaff: isTicketStaff,
  firstReply: firstReply,
  replyToMessage: replyToMessage,
  handledEmbed: handledEmbed,
  fallbackReply: fallbackReply
};
