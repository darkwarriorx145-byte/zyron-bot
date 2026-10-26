const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const aiGuard = require('../utils/aiGuard');

const SUBCOMMANDS = [
  { name: 'status', description: 'Show the AI engine status and the current server settings.' },
  { name: 'on', description: 'Enable the AI second opinion for this server.' },
  { name: 'off', description: 'Disable the AI second opinion for this server.' },
  { name: 'scan on|off', description: 'Scan risky messages that the keyword filters miss.' },
  { name: 'model <name|auto>', description: 'Use a specific OpenRouter model for this server.' },
  { name: 'threshold <0.3-0.95>', description: 'How confident the AI must be before it overrides a punishment.' },
  { name: 'test <text>', description: 'Classify a sample message with the AI engine.' },
  { name: 'clear', description: 'Clear the AI response cache.' }
];

function prefixFor(guildId) {
  const settings = db.getGuild(guildId);
  return settings.prefix || config.prefix;
}

function footer(iconURL) {
  return {
    text: config.botName + ' AI Guard | Powered by ' + config.company,
    iconURL: iconURL
  };
}

module.exports = {
  name: 'ai',
  aliases: ['aiguard', 'aisecurity'],
  description: 'OpenRouter AI second opinion for nukes, raids and abusive messages.',
  usage: '<status|on|off|scan|model|threshold|test|clear>',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  subcommands: SUBCOMMANDS,
  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = prefixFor(message.guild.id);
    const sub = (args[0] || 'status').toLowerCase();
    const icon = client.user.displayAvatarURL();

    if (sub === 'help') {
      const lines = SUBCOMMANDS.map(function (item) {
        return '**' + prefix + 'ai ' + item.name + '** — ' + item.description;
      });

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🧠 Zyron AI Guard')
            .setDescription(
              'The AI engine is a second opinion that runs before Zyron punishes someone.\n' +
              'It can clear a false positive, or escalate a real nuke, raid or abuse case.\n\n' +
              '**Commands**\n' + lines.join('\n') + '\n\n' +
              '**Safety**\n' +
              '• Messages can never be banned by the AI, only timed out.\n' +
              '• If the AI is offline or unsure, the normal Zyron rules decide.\n' +
              '• Mass actions and young-account raids still trigger instantly.'
            )
            .setFooter(footer(icon))
            .setTimestamp()
        ]
      });
    }

    if (sub === 'status') {
      const info = aiGuard.status();
      const state = info.configured ? '🟢 Connected' : '🔴 Not configured';
      const guildState = settings.aiEnabled === false ? '🔴 Disabled' : '🟢 Enabled';
      const scanState = settings.aiScanMessages === false ? '🔴 Off' : '🟢 On';
      const model = settings.aiModel ? settings.aiModel : info.model;

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(info.configured ? config.colors.success : config.colors.warning)
            .setTitle('🧠 AI Guard Status')
            .setDescription(
              '**Engine:** ' + state + '\n' +
              '**This Server:** ' + guildState + '\n' +
              '**Model:** ' + model + '\n' +
              '**Fallback Model:** ' + info.fallbackModel + '\n' +
              '**Risky Message Scan:** ' + scanState + '\n' +
              '**Confidence Threshold:** ' + Math.round(aiGuard.getConfidence(settings) * 100) + '%\n' +
              '**Timeout:** ' + info.timeoutMs + ' ms\n' +
              '**Queue:** ' + info.queue + ' waiting / ' + info.active + ' running\n\n' +
              (info.configured
                ? 'The AI key is configured. It confirms events when credits or free quota are available.'
                : 'Add **OPENROUTER_API_KEY** to the bot .env file to switch the AI on.')
            )
            .setFooter(footer(icon))
            .setTimestamp()
        ]
      });
    }

    if (sub === 'on' || sub === 'off') {
      const enabled = sub === 'on';
      db.updateGuild(message.guild.id, { aiEnabled: enabled });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(enabled ? config.colors.success : config.colors.warning)
            .setTitle(enabled ? '🧠 AI Guard Enabled' : '🧠 AI Guard Disabled')
            .setDescription(
              enabled
                ? 'The AI will now review ambiguous anti-nuke events, raids and risky messages before Zyron acts.'
                : 'The AI is now off for this server. Zyron will use its normal deterministic rules.'
            )
            .setFooter(footer(icon))
            .setTimestamp()
        ]
      });
    }

    if (sub === 'scan') {
      const value = (args[1] || '').toLowerCase();
      if (value !== 'on' && value !== 'off') {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Usage').setDescription('Use **' + prefix + 'ai scan on** or **' + prefix + 'ai scan off**.')]
        });
      }

      const enabled = value === 'on';
      db.updateGuild(message.guild.id, { aiScanMessages: enabled });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(enabled ? config.colors.success : config.colors.warning)
            .setTitle(enabled ? '🔍 AI Message Scan Enabled' : '🔍 AI Message Scan Disabled')
            .setDescription(
              enabled
                ? 'Messages with threat, doxxing, scam or NSFW signals will be sent to the AI even when the keyword filters miss them.'
                : 'Only messages that already trip a Zyron filter will be sent to the AI.'
            )
            .setFooter(footer(icon))
            .setTimestamp()
        ]
      });
    }

    if (sub === 'model') {
      const value = args.slice(1).join(' ').trim();
      if (!value) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Usage').setDescription('Use **' + prefix + 'ai model openrouter/auto** or **' + prefix + 'ai model auto** to reset.')]
        });
      }

      if (value.toLowerCase() === 'auto' || value.toLowerCase() === 'default') {
        db.updateGuild(message.guild.id, { aiModel: null });
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ AI Model Reset').setDescription('This server now uses the bot default model: **' + aiGuard.status().model + '**.')]
        });
      }

      if (value.length > 100) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Model Name Too Long').setDescription('Keep the model name under 100 characters.')]
        });
      }

      db.updateGuild(message.guild.id, { aiModel: value });
      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ AI Model Updated').setDescription('This server now uses **' + value + '** for AI checks.')]
      });
    }

    if (sub === 'threshold') {
      let value = parseFloat(args[1]);
      if (isNaN(value)) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Usage').setDescription('Use **' + prefix + 'ai threshold 0.6**. The value must be between 0.3 and 0.95.')]
        });
      }

      if (value > 1 && value <= 100) value = value / 100;
      value = Math.max(0.3, Math.min(0.95, value));
      db.updateGuild(message.guild.id, { aiConfidence: value });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ AI Threshold Updated')
            .setDescription('The AI must now be at least **' + Math.round(value * 100) + '%** confident before it overrides a punishment.')
        ]
      });
    }

    if (sub === 'test') {
      const text = args.slice(1).join(' ').trim();
      if (!text) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle('❌ Usage').setDescription('Use **' + prefix + 'ai test <message>** to classify a sample message.')]
        });
      }

      if (!aiGuard.isConfigured()) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('🔴 AI Not Configured').setDescription('Add **OPENROUTER_API_KEY** to the bot .env file first.')]
        });
      }

      const thinking = await message.channel.send({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle('🧠 Thinking...').setDescription('Sending the sample to the AI engine.')]
      });

      const result = await aiGuard.classifyMessage({
        settings: settings,
        guild: message.guild,
        channelName: message.channel ? message.channel.name : null,
        author: message.author,
        content: text,
        mentions: 0,
        everyone: false,
        links: 0,
        heuristic: 'manual test'
      });

      if (!result.ok) {
        return thinking.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ AI Test Failed')
              .setDescription(String(result.reason || result.error || 'The AI did not answer.'))
          ]
        });
      }

      return thinking.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(result.verdict === 'legit' ? config.colors.success : config.colors.warning)
            .setTitle('🧠 AI Test Result')
            .setDescription('**Sample:** ' + text.slice(0, 500))
            .addFields(
              { name: 'Verdict', value: String(result.verdict).toUpperCase(), inline: true },
              { name: 'Category', value: String(result.category || 'none'), inline: true },
              { name: 'Action', value: String(result.action || 'none'), inline: true },
              { name: 'Severity', value: String(result.severity || 'medium'), inline: true },
              { name: 'Confidence', value: Math.round((result.confidence || 0) * 100) + '%', inline: true },
              { name: 'Latency', value: String(result.latency || 0) + ' ms', inline: true },
              { name: 'Model', value: String(result.model || 'unknown'), inline: false },
              { name: 'Reason', value: String(result.reason || 'No reason'), inline: false }
            )
            .setFooter(footer(icon))
            .setTimestamp()
        ]
      });
    }

    if (sub === 'clear') {
      aiGuard.clearCache();
      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ AI Cache Cleared').setDescription('Every cached AI verdict was removed.')]
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.danger)
          .setTitle('❌ Unknown Subcommand')
          .setDescription('Use **' + prefix + 'ai** to see every AI option.')
      ]
    });
  }
};
