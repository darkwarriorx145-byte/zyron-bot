const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');
const inviteLogger = require('./inviteLogger');

async function sendVerificationDM(member, settings) {
  if (!settings.verificationEnabled || !settings.verificationRules) return false;

  try {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🔐 Verify to Access ' + member.guild.name)
      .setDescription(settings.verificationRules.slice(0, 4000))
      .addFields({ name: 'Step', value: 'Click the button below to accept the rules and gain access.' })
      .setFooter({ text: config.botName + ' | Powered by ' + config.company })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:accept:' + member.guild.id)
        .setLabel('I Accept the Rules')
        .setStyle(ButtonStyle.Success)
    );

    await member.send({ embeds: [embed], components: [row] });
    return true;
  } catch (err) {
    console.error('Verification DM failed for ' + member.id + ':', err.message);
    return false;
  }
}

async function handleVerificationAccept(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'Server not found.', ephemeral: true });

  const settings = db.getGuild(guildId);
  if (!settings.verificationEnabled || !settings.verificationRole) {
    return interaction.reply({ content: 'Verification is not configured.', ephemeral: true });
  }

  const member = await guild.members.fetch(interaction.user.id).catch(function () {
    return null;
  });
  if (!member) return interaction.reply({ content: 'You are not in this server.', ephemeral: true });

  const roleIds = [settings.verificationRole].concat(Array.isArray(settings.verificationRoles) ? settings.verificationRoles : []);
  const uniqueRoleIds = roleIds.filter(function (id, index) {
    return id && roleIds.indexOf(id) === index;
  });
  const roles = uniqueRoleIds.map(function (id) { return guild.roles.cache.get(id); }).filter(Boolean);
  if (roles.length === 0) return interaction.reply({ content: 'Verification role not found.', ephemeral: true });

  const inGuild = interaction.inGuild ? interaction.inGuild() : Boolean(interaction.guildId);

  const alreadyVerified = roles.every(function (role) {
    return member.roles.cache.has(role.id);
  });

  if (alreadyVerified) {
    try {
      await inviteLogger.countVerifiedInvite(guild, member, settings);
    } catch (err) {
      console.error('Verified invite sync failed for ' + member.id + ':', err.message);
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('✅ Already Verified')
        .setDescription('You are already verified in **' + guild.name + '**.')
        .setFooter({ text: config.botName + ' | Powered by ' + config.company })],
      ephemeral: inGuild
    }).catch(function () {});
  }

  try {
    const editable = roles.filter(function (role) { return role.editable; }).map(function (role) { return role.id; });
    if (editable.length === 0) {
      return interaction.reply({ content: 'I cannot assign the verification role. Move my role above it.', ephemeral: true });
    }
    await member.roles.add(editable, 'Verified via rules acceptance');

    let inviteResult = null;
    try {
      inviteResult = await inviteLogger.countVerifiedInvite(guild, member, settings);
    } catch (err) {
      console.error('Verified invite count failed for ' + member.id + ':', err.message);
    }

    const successEmbed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Verified')
      .setDescription('You have been verified and can now access ' + guild.name + '.')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company })
      .setTimestamp();

    // Private confirmation only. The public verification panel is left untouched
    // so the button stays available for other members.
    await interaction.reply({ embeds: [successEmbed], ephemeral: inGuild }).catch(function () {});

    if (inGuild) {
      await member.send({ embeds: [successEmbed] }).catch(function () {});
    }

    const logId = settings.verificationLogChannel || settings.logChannel;
    const logChannel = logId ? guild.channels.cache.get(logId) : null;
    if (logChannel) {
      logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('Member Verified')
          .setDescription(
            '<@' + member.id + '> accepted the rules and was verified.' +
            (inviteResult && inviteResult.counted
              ? '\n**Invite counted for:** <@' + inviteResult.inviter + '>'
              : (inviteResult && inviteResult.alreadyCounted ? '\n**Invite:** Already counted.' : ''))
          )
          .setTimestamp()]
      }).catch(function () {});
    }
  } catch (err) {
    console.error('Verification failed for ' + member.id + ':', err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Failed to verify you. Contact staff.', ephemeral: true }).catch(function () {});
    }
  }
}

async function setupVerification(guild, settings, channelId, roleId, rules, logChannelId, questions) {
  const updates = {
    verificationEnabled: true,
    verificationChannel: channelId,
    verificationRole: roleId,
    verificationRules: rules,
    verificationLogChannel: logChannelId,
    verificationQuestions: questions || []
  };
  db.updateGuild(guild.id, updates);

  const channel = guild.channels.cache.get(channelId);
  if (channel) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🔐 Server Verification')
      .setDescription(rules.slice(0, 4000) + '\n\nClick the button below to verify and gain access.')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:accept:' + guild.id)
        .setLabel('I Accept the Rules')
        .setStyle(ButtonStyle.Success)
    );
    await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
  }
  return updates;
}

module.exports = {
  sendVerificationDM,
  handleVerificationAccept,
  setupVerification
};