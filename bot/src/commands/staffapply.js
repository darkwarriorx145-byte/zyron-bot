const {
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');
const theme = require('../utils/theme');

const DEFAULT_PANEL_TITLE = '📝 ' + config.botName + ' Staff Applications';
const DEFAULT_PANEL_DESCRIPTION =
  'Want to join the staff team?\n\n' +
  'Click **Apply Now** and fill in the application form.\n' +
  'Our management team will review it and reply by DM.\n\n' +
  '**Requirements**\n' +
  '• Be active in the server\n' +
  '• Be respectful and mature\n' +
  '• No recent punishments';
const DEFAULT_PANEL_FOOTER = config.botName + ' • Powered by ' + config.company;
const DEFAULT_QUESTIONS = [
  { label: 'Name / nickname', placeholder: 'Your name or nickname', style: 'short', required: true, maxLength: 50 },
  { label: 'Age', placeholder: 'Your age', style: 'short', required: true, maxLength: 3 },
  { label: 'Timezone / country', placeholder: 'e.g. GMT+5 / India', style: 'short', required: true, maxLength: 60 },
  { label: 'Previous staff experience', placeholder: 'Servers, roles and responsibilities', style: 'paragraph', required: true, maxLength: 500 },
  { label: 'Why should we pick you?', placeholder: 'Tell us about yourself', style: 'paragraph', required: true, maxLength: 800 }
];

function getQuestions(settings) {
  const source = Array.isArray(settings.staffApplyQuestions) && settings.staffApplyQuestions.length > 0
    ? settings.staffApplyQuestions
    : DEFAULT_QUESTIONS;

  return source.slice(0, 5).map(function (question, index) {
    const style = question.style === 'paragraph' ? 'paragraph' : 'short';
    let maxLength = parseInt(question.maxLength, 10);
    if (isNaN(maxLength)) maxLength = style === 'paragraph' ? 500 : 100;
    return {
      label: String(question.label || ('Question ' + (index + 1))).slice(0, 45),
      placeholder: String(question.placeholder || '').slice(0, 100),
      style: style,
      required: question.required !== false,
      maxLength: Math.max(1, Math.min(1000, maxLength))
    };
  });
}

function panelEmbed(settings) {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(settings.staffApplyPanelTitle || DEFAULT_PANEL_TITLE)
    .setDescription((settings.staffApplyPanelDescription || DEFAULT_PANEL_DESCRIPTION).slice(0, 4096))
    .setFooter({ text: (settings.staffApplyPanelFooter || DEFAULT_PANEL_FOOTER).slice(0, 2048) })
    .setTimestamp();
}

function panelRow(settings) {
  const button = new ButtonBuilder()
    .setCustomId('staff-apply:open')
    .setLabel(String(settings.staffApplyButtonLabel || 'Apply Now').slice(0, 80))
    .setStyle(ButtonStyle.Success);

  try {
    button.setEmoji(settings.staffApplyButtonEmoji || '📝');
  } catch (err) {
    button.setEmoji('📝');
  }

  return new ActionRowBuilder().addComponents(button);
}

module.exports = {
  name: 'staff-apply',
  aliases: ['staffapply', 'apply'],
  description: 'Staff application system with a panel, modal form and accept/deny buttons.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '[setup [#channel]|panel]',
  subcommands: [
    { name: 'panel', description: 'Send the staff application panel in this channel.' },
    { name: 'setup [#channel]', description: 'Choose where submitted applications are sent.' }
  ],
  async execute(client, message, args) {
    const sub = (args[0] || '').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;

    if (sub === 'setup') {
      const channel = message.mentions.channels.first() || message.channel;
      db.updateGuild(message.guild.id, { applicationChannel: channel.id });
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Applications Channel Set')
            .setDescription('New staff applications will be sent to ' + channel + '.')
        ]
      });
    }

    if (sub === 'panel' || sub === '') {
      await message.channel.send({ embeds: [panelEmbed(settings)], components: [panelRow(settings)] });
      if (message.deletable) message.delete().catch(function () {});
      return;
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('❌ Unknown Subcommand')
          .setDescription('Use **' + prefix + 'staff-apply panel** or **' + prefix + 'staff-apply setup #channel**')
      ]
    });
  },

  async handleInteraction(client, interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'open') {
      const settings = db.getGuild(interaction.guild.id);
      const questions = getQuestions(settings);
      const modal = new ModalBuilder()
        .setCustomId('staff-apply:submit')
        .setTitle(String(settings.staffApplyModalTitle || 'Staff Application').slice(0, 45));

      questions.forEach(function (question, index) {
        const input = new TextInputBuilder()
          .setCustomId('q' + index)
          .setLabel(question.label)
          .setStyle(question.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setMaxLength(question.maxLength)
          .setRequired(question.required);

        if (question.placeholder) input.setPlaceholder(question.placeholder);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      });

      return interaction.showModal(modal);
    }

    if (action === 'submit') {
      const settings = db.getGuild(interaction.guild.id);
      const questions = getQuestions(settings);
      const channel = settings.applicationChannel
        ? interaction.guild.channels.cache.get(settings.applicationChannel)
        : interaction.channel;

      if (!channel) {
        return interaction.reply({ content: 'The applications channel is not configured. Ask an admin to run .staff-apply setup #channel', ephemeral: true });
      }

      const fields = [
        {
          name: '👤 User',
          value: '<@' + interaction.user.id + '>\n' + interaction.user.tag,
          inline: true
        }
      ];

      questions.forEach(function (question, index) {
        let value = '';
        try {
          value = interaction.fields.getTextInputValue('q' + index);
        } catch (err) {
          value = '';
        }
        fields.push({
          name: question.label.slice(0, 256),
          value: String(value || '—').slice(0, 1024),
          inline: false
        });
      });

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({
          name: interaction.user.tag + ' applied for staff',
          iconURL: interaction.user.displayAvatarURL()
        })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTitle('📝 New Staff Application')
        .addFields(fields)
        .setFooter({ text: config.botName + ' • Powered by ' + config.company })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('staff-apply:accept:' + interaction.user.id)
          .setLabel('Accept')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('staff-apply:deny:' + interaction.user.id)
          .setLabel('Deny')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );

      const applicationMessage = await channel.send({
        content: '<@' + interaction.user.id + '>',
        embeds: [embed],
        components: [row]
      });

      db.addStaffApplication(interaction.guild.id, {
        userId: interaction.user.id,
        channelId: channel.id,
        messageId: applicationMessage.id
      });

      return interaction.reply({ content: 'Your staff application was submitted. You will receive a DM with the result.', ephemeral: true });
    }

    if (action === 'accept' || action === 'deny') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: 'Only staff with Manage Server can review applications.', ephemeral: true });
      }

      const userId = parts[2];
      const accepted = action === 'accept';
      const settings = db.getGuild(interaction.guild.id);

      await interaction.update({ components: [] });

      const acceptedRoles = [];
      if (settings.staffApplyAcceptRole) acceptedRoles.push(settings.staffApplyAcceptRole);
      (Array.isArray(settings.staffApplyAcceptRoles) ? settings.staffApplyAcceptRoles : []).forEach(function (roleId) {
        if (roleId && acceptedRoles.indexOf(roleId) === -1) acceptedRoles.push(roleId);
      });

      if (accepted && acceptedRoles.length > 0) {
        const member = await interaction.guild.members.fetch(userId).catch(function () {
          return null;
        });

        for (let i = 0; i < acceptedRoles.length; i++) {
          const role = interaction.guild.roles.cache.get(acceptedRoles[i]) ||
            await interaction.guild.roles.fetch(acceptedRoles[i]).catch(function () {
              return null;
            });

          if (member && role) {
            await member.roles.add(role, 'Staff application accepted').catch(function (err) {
              console.error('Staff accept role error:', err.message);
            });
          }
        }
      }

      db.updateStaffApplication(interaction.guild.id, userId, {
        status: accepted ? 'accepted' : 'denied',
        decision: accepted ? 'accepted' : 'denied',
        reviewedBy: interaction.user.id,
        reviewedAt: Date.now(),
        messageId: interaction.message ? interaction.message.id : null
      });

      const user = await client.users.fetch(userId).catch(function () {
        return null;
      });

      if (user) {
        const defaultText = accepted
          ? 'Congratulations! Your staff application in **{server}** was accepted. A manager will contact you soon.'
          : 'Unfortunately your staff application in **{server}** was denied. You can apply again later.';
        const template = accepted
          ? (settings.staffApplyAcceptMessage || defaultText)
          : (settings.staffApplyDenyMessage || defaultText);
        const message = String(template).split('{server}').join(interaction.guild.name);

        user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(accepted ? config.colors.success : config.colors.danger)
              .setTitle(accepted ? '✅ Staff Application Accepted' : '❌ Staff Application Denied')
              .setDescription(message.slice(0, 4096))
              .setFooter({ text: config.botName + ' • Powered by ' + config.company })
          ]
        }).catch(function () {});
      }

      return interaction.followUp({
        content: (accepted ? theme.emoji('success') + ' Application accepted' : theme.emoji('error') + ' Application denied') + ' by ' + interaction.user.tag + '.'
      });
    }
  }
};
