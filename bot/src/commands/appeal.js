const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const db = require('../database/db');
const appealUtil = require('../utils/appeal');
const config = require('../../config.json');

module.exports = {
  name: 'appeal',
  description: 'Private appeal flow for kicked or banned members.',
  async handleInteraction(client, interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const guildId = parts[2];
    const caseId = parts[3];

    if (action === 'start') {
      const appeal = db.getAppeal(guildId, caseId);
      if (!appeal) {
        return interaction.reply({ content: 'This appeal case no longer exists.', ephemeral: true });
      }
      if (appeal.status !== 'pending') {
        return interaction.reply({ content: 'This appeal was already reviewed.', ephemeral: true });
      }
      if (appeal.userId !== interaction.user.id) {
        return interaction.reply({ content: 'This appeal belongs to another member.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('appeal:submit:' + guildId + ':' + caseId)
        .setTitle('Appeal Questions');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('apology')
            .setLabel('Did you apologize? (yes/no)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(5)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('whatHappened')
            .setLabel('What happened?')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('whyUnban')
            .setLabel('Why should we approve your appeal?')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    if (action === 'submit') {
      const appeal = db.getAppeal(guildId, caseId);
      if (!appeal) {
        return interaction.reply({ content: 'This appeal case no longer exists.', ephemeral: true });
      }
      if (appeal.userId !== interaction.user.id) {
        return interaction.reply({ content: 'This appeal belongs to another member.', ephemeral: true });
      }

      const apologyRaw = String(interaction.fields.getTextInputValue('apology') || '').trim().toLowerCase();
      const yes = ['yes', 'y', 'yeah', 'yep', 'true', 'i did', 'sorry'];
      const no = ['no', 'n', 'nope', 'false', 'i did not', 'not yet'];
      if (yes.indexOf(apologyRaw) === -1 && no.indexOf(apologyRaw) === -1) {
        return interaction.reply({ content: 'Answer the apology question with **yes** or **no**.', ephemeral: true });
      }

      const answers = {
        apology: apologyRaw,
        whatHappened: String(interaction.fields.getTextInputValue('whatHappened') || '').slice(0, 1000),
        whyUnban: String(interaction.fields.getTextInputValue('whyUnban') || '').slice(0, 1000)
      };

      const updated = db.updateAppeal(guildId, caseId, {
        answers: answers,
        submittedAt: Date.now(),
        status: 'pending'
      });

      const guild = interaction.guild || client.guilds.cache.get(guildId);
      if (guild) {
        const settings = db.getGuild(guildId);
        await appealUtil.sendLog(guild, settings, updated, 'Appeal Submitted', config.colors.primary);
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('Appeal Submitted')
            .setDescription(
              'Your answers were sent to the staff team.\n\n' +
              'All questions were required and have been recorded. ' +
              'You will receive a DM when your appeal is approved or declined.'
            )
            .setFooter({ text: config.botName + ' | Powered by ' + config.company })
        ],
        ephemeral: true
      });
    }
  }
};
