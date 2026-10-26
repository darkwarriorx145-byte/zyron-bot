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

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('📝 ' + config.botName + ' Staff Applications')
    .setDescription(
      'Want to join the staff team?\n\n' +
      'Click **Apply Now** and fill in the application form.\n' +
      'Our management team will review it and reply by DM.\n\n' +
      '**Requirements**\n' +
      '• Be active in the server\n' +
      '• Be respectful and mature\n' +
      '• No recent punishments'
    )
    .setFooter({ text: config.botName + ' • Powered by ' + config.company })
    .setTimestamp();
}

function panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('staff-apply:open')
      .setLabel('Apply Now')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Success)
  );
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
      await message.channel.send({ embeds: [panelEmbed()], components: [panelRow()] });
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
      const modal = new ModalBuilder()
        .setCustomId('staff-apply:submit')
        .setTitle('Staff Application');

      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Name / nickname')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(true);

      const ageInput = new TextInputBuilder()
        .setCustomId('age')
        .setLabel('Age')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(3)
        .setRequired(true);

      const timezoneInput = new TextInputBuilder()
        .setCustomId('timezone')
        .setLabel('Timezone / country')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(60)
        .setRequired(true);

      const experienceInput = new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('Previous staff experience')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);

      const whyInput = new TextInputBuilder()
        .setCustomId('why')
        .setLabel('Why should we pick you?')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(800)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(timezoneInput),
        new ActionRowBuilder().addComponents(experienceInput),
        new ActionRowBuilder().addComponents(whyInput)
      );

      return interaction.showModal(modal);
    }

    if (action === 'submit') {
      const settings = db.getGuild(interaction.guild.id);
      const channel = settings.applicationChannel
        ? interaction.guild.channels.cache.get(settings.applicationChannel)
        : interaction.channel;

      if (!channel) {
        return interaction.reply({ content: 'The applications channel is not configured. Ask an admin to run .staff-apply setup #channel', ephemeral: true });
      }

      const name = interaction.fields.getTextInputValue('name');
      const age = interaction.fields.getTextInputValue('age');
      const timezone = interaction.fields.getTextInputValue('timezone');
      const experience = interaction.fields.getTextInputValue('experience');
      const why = interaction.fields.getTextInputValue('why');

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({
          name: interaction.user.tag + ' applied for staff',
          iconURL: interaction.user.displayAvatarURL()
        })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTitle('📝 New Staff Application')
        .addFields(
          { name: '👤 User', value: '<@' + interaction.user.id + '>\n' + interaction.user.tag, inline: true },
          { name: '🎂 Age', value: age, inline: true },
          { name: '🌍 Timezone', value: timezone, inline: true },
          { name: '🧠 Name', value: name, inline: false },
          { name: '📚 Experience', value: experience, inline: false },
          { name: '💬 Why them?', value: why, inline: false }
        )
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

      await channel.send({ content: '<@' + interaction.user.id + '>', embeds: [embed], components: [row] });

      return interaction.reply({ content: 'Your staff application was submitted. You will receive a DM with the result.', ephemeral: true });
    }

    if (action === 'accept' || action === 'deny') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: 'Only staff with Manage Server can review applications.', ephemeral: true });
      }

      const userId = parts[2];
      const accepted = action === 'accept';

      await interaction.update({ components: [] });

      const user = await client.users.fetch(userId).catch(function () {
        return null;
      });

      if (user) {
        user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(accepted ? config.colors.success : config.colors.danger)
              .setTitle(accepted ? '✅ Staff Application Accepted' : '❌ Staff Application Denied')
              .setDescription(
                accepted
                  ? 'Congratulations! Your staff application in **' + interaction.guild.name + '** was accepted. A manager will contact you soon.'
                  : 'Unfortunately your staff application in **' + interaction.guild.name + '** was denied. You can apply again later.'
              )
              .setFooter({ text: config.botName + ' • Powered by ' + config.company })
          ]
        }).catch(function () {});
      }

      return interaction.followUp({
        content: (accepted ? '✅ Application accepted' : '❌ Application denied') + ' by ' + interaction.user.tag + '.'
      });
    }
  }
};
