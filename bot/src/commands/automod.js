const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const security = require('../utils/security');
const ZyronEmbedBuilder = require('../utils/embedBuilder');
const config = require('../../config.json');

const SUBCOMMANDS = [
  { name: 'status', description: 'Show the AutoMod and anti-abuse configuration.' },
  { name: 'setup', description: 'Create or refresh the native Discord AutoMod rules.' },
  { name: 'remove', description: 'Delete every Zyron AutoMod rule from Discord.' },
  { name: 'on', description: 'Enable the AutoMod integration.' },
  { name: 'off', description: 'Disable the AutoMod integration.' },
  { name: 'abuse <on|off>', description: 'Toggle the English + Hindi profanity filter.' },
  { name: 'spam <on|off>', description: 'Toggle anti-spam (mutes spammers).' },
  { name: 'link <on|off>', description: 'Toggle anti-link (mutes link posters).' },
  { name: 'everyone <on|off>', description: 'Toggle anti @everyone / @here (mutes offenders).' },
  { name: 'betrayal <on|off>', description: 'Toggle rogue staff / owner detection.' },
  { name: 'raid <on|off>', description: 'Toggle automatic join-raid detection.' },
  { name: 'raidpunish <kick|ban>', description: 'Choose what happens to raiders: kick or ban.' },
  { name: 'lockdown <on|off>', description: 'Toggle automatic server lockdown.' },
  { name: 'punishment <ban|kick|mute>', description: 'Set the punishment for repeat offenders.' },
  { name: 'test <text>', description: 'Test the profanity detector with a message.' }
];

function flag(value) {
  return value ? '🟢 **ON**' : '🔴 **OFF**';
}

async function nativeRuleCount(guild) {
  if (!guild.autoModerationRules) return 'Unsupported';
  const rules = await guild.autoModerationRules.fetch().catch(function () {
    return null;
  });
  if (!rules) return 'No access';
  const list = Array.from(rules.values()).filter(function (rule) {
    return rule.name.indexOf('Zyron |') === 0;
  });
  return String(list.length);
}

module.exports = {
  name: 'automod',
  aliases: ['am', 'automoderation', 'abuse'],
  description: 'Native Discord AutoMod plus the Zyron profanity and anti-abuse filter.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<status|setup|remove|on|off|abuse|betrayal|raid|lockdown|punishment|test>',
  subcommands: SUBCOMMANDS,
  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'status' || sub === 'settings' || sub === 'view') {
      const count = await nativeRuleCount(message.guild);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🤖 AutoMod & Anti-Abuse Panel')
            .setDescription(
              '**Native AutoMod:** ' + flag(settings.features.autoMod) + '\n' +
              '**Profanity Filter (EN + HI):** ' + flag(settings.features.antiAbuse) + '\n' +
              '**Anti Spam (mute):** ' + flag(settings.features.antiSpam) + '\n' +
              '**Anti Link (mute):** ' + flag(settings.features.antiLink) + '\n' +
              '**Anti @everyone (mute):** ' + flag(settings.features.antiEveryone) + '\n' +
              '**Anti Betrayal:** ' + flag(settings.features.antiBetrayal) + '\n' +
              '**Anti Raid:** ' + flag(settings.features.antiRaid) + '\n' +
              '**Raid Punishment:** **' + String(settings.raidPunishment || 'kick').toUpperCase() + '**\n' +
              '**Auto Lockdown:** ' + flag(settings.features.autoLockdown) + '\n' +
              '**Punishment:** **' + String(settings.punishment || 'ban').toUpperCase() + '**\n' +
              '**Discord AutoMod Rules:** **' + count + '**\n\n' +
              '**' + prefix + 'automod setup** — create native rules\n' +
              '**' + prefix + 'automod abuse on** — toggle profanity filter\n' +
              '**' + prefix + 'automod test <text>** — test the filter\n' +
              '**' + prefix + 'automod punishment ban** — set repeat punishment'
            )
            .setFooter({ text: config.botName + ' • Powered by ' + config.company })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'setup' || sub === 'create') {
      const result = await security.provisionAutoMod(message.guild, settings);

      if (!result.ok) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('AutoMod Setup Failed', result.reason)]
        });
      }

      db.setFeature(message.guild.id, 'autoMod', true);

      return message.reply({
        embeds: [
          ZyronEmbedBuilder.success(
            'AutoMod Ready',
            '**Created:** ' + (result.created.length ? result.created.join(', ') : 'none') + '\n' +
            '**Updated:** ' + (result.updated.length ? result.updated.join(', ') : 'none') + '\n\n' +
            'Native rules now block mention spam, message spam, links and profanity.'
          )
        ]
      });
    }

    if (sub === 'remove' || sub === 'delete') {
      const removed = await security.removeAutoMod(message.guild);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('AutoMod Removed', 'Deleted **' + removed + '** native Zyron AutoMod rule(s).')]
      });
    }

    if (sub === 'on' || sub === 'enable') {
      db.setFeature(message.guild.id, 'autoMod', true);
      return message.reply({ embeds: [ZyronEmbedBuilder.success('AutoMod Enabled', 'The AutoMod integration is now active.')] });
    }

    if (sub === 'off' || sub === 'disable') {
      db.setFeature(message.guild.id, 'autoMod', false);
      return message.reply({ embeds: [ZyronEmbedBuilder.warning('AutoMod Disabled', 'The AutoMod integration is now inactive.')] });
    }

    if (sub === 'abuse' || sub === 'profanity' || sub === 'filter') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiAbuse);
      db.setFeature(message.guild.id, 'antiAbuse', next);
      return message.reply({
        embeds: [
          ZyronEmbedBuilder.success(
            'Profanity Filter Updated',
            'English and Hindi abuse detection is now ' + (next ? '🟢 ON' : '🔴 OFF') + '.'
          )
        ]
      });
    }

    if (sub === 'spam') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiSpam);
      db.setFeature(message.guild.id, 'antiSpam', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti Spam Updated', 'Spammers will ' + (next ? 'now' : 'no longer') + ' be muted automatically.')]
      });
    }

    if (sub === 'link' || sub === 'links') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiLink);
      db.setFeature(message.guild.id, 'antiLink', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti Link Updated', 'Link posters will ' + (next ? 'now' : 'no longer') + ' be muted automatically.')]
      });
    }

    if (sub === 'everyone' || sub === 'mention') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiEveryone);
      db.setFeature(message.guild.id, 'antiEveryone', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti @everyone Updated', 'Mass mentions will ' + (next ? 'now' : 'no longer') + ' be muted automatically.')]
      });
    }

    if (sub === 'betrayal') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiBetrayal);
      db.setFeature(message.guild.id, 'antiBetrayal', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti Betrayal Updated', 'Rogue owner / staff detection is now ' + (next ? '🟢 ON' : '🔴 OFF') + '.')]
      });
    }

    if (sub === 'raid') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.antiRaid);
      db.setFeature(message.guild.id, 'antiRaid', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Anti Raid Updated', 'Join-raid detection is now ' + (next ? '🟢 ON' : '🔴 OFF') + '.')]
      });
    }

    if (sub === 'raidpunish' || sub === 'raidaction') {
      const choice = (args[1] || '').toLowerCase();
      if (choice !== 'kick' && choice !== 'ban') {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Invalid Raid Punishment', 'Choose either **kick** or **ban**.')]
        });
      }
      db.updateGuild(message.guild.id, { raidPunishment: choice });
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Raid Punishment Set', 'Raiders will now be **' + choice.toUpperCase() + '** automatically.')]
      });
    }

    if (sub === 'lockdown') {
      const choice = (args[1] || '').toLowerCase();
      const next = choice === 'on' ? true : (choice === 'off' ? false : !settings.features.autoLockdown);
      db.setFeature(message.guild.id, 'autoLockdown', next);
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Auto Lockdown Updated', 'Automatic server lockdown is now ' + (next ? '🟢 ON' : '🔴 OFF') + '.')]
      });
    }

    if (sub === 'punishment' || sub === 'punish') {
      const choice = (args[1] || '').toLowerCase();
      if (['ban', 'kick', 'mute'].indexOf(choice) === -1) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Invalid Punishment', 'Choose one of: ban, kick, mute.')]
        });
      }
      db.updateGuild(message.guild.id, { punishment: choice });
      return message.reply({
        embeds: [ZyronEmbedBuilder.success('Punishment Set', 'Repeat offenders will now be punished with **' + choice.toUpperCase() + '**.')]
      });
    }

    if (sub === 'test') {
      const text = args.slice(1).join(' ');
      if (!text) {
        return message.reply({
          embeds: [ZyronEmbedBuilder.error('Missing Text', 'Usage: **' + prefix + 'automod test <text>**')]
        });
      }

      const found = security.findProfanity(text);

      return message.reply({
        embeds: [
          found
            ? ZyronEmbedBuilder.warning('Filter Match', 'That text would be blocked.\n**Matched:** ' + found)
            : ZyronEmbedBuilder.success('Clean Text', 'No English or Hindi abuse was detected in that text.')
        ]
      });
    }

    return message.reply({
      embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use **' + prefix + 'automod** to see every option.')]
    });
  }
};
