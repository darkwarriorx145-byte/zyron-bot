const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const theme = require('./theme');

const emoji = theme.emoji;

function userTag(target) {
  if (!target) return 'Unknown';
  const user = target.user ? target.user : target;
  if (user.tag) return user.tag;
  if (user.username) return user.username;
  return String(target.id ? target.id : target);
}

function section(title) {
  return '**' + title + '**';
}

function line(key, label, value) {
  return emoji(key) + ' **' + label + ':** ' + value;
}

function field(key, label, value, inline) {
  return {
    name: emoji(key) + ' ' + label,
    value: String(value),
    inline: Boolean(inline)
  };
}

function status(value) {
  return emoji(value ? 'success' : 'error') + ' **' + (value ? 'ON' : 'OFF') + '**';
}

function formatStamp(date) {
  const value = date instanceof Date ? date : new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = months[value.getUTCMonth()];
  const year = value.getUTCFullYear();
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  const suffix = value.getUTCHours() >= 12 ? 'PM' : 'AM';
  let hours = value.getUTCHours() % 12;

  if (hours === 0) hours = 12;

  return day + ' ' + month + ' ' + year + ' ' +
    String(hours).padStart(2, '0') + ':' + minutes + ' ' + suffix + ' UTC';
}

class ZyronEmbedBuilder {
  static emoji(key) {
    return emoji(key);
  }

  static line(key, label, value) {
    return line(key, label, value);
  }

  static section(title) {
    return section(title);
  }

  static base(options) {
    const opts = options || {};
    const embed = new EmbedBuilder()
      .setColor(
        opts.color ||
        (config.theme && config.theme.color) ||
        config.colors.primary
      )
      .setFooter({
        text:
          opts.footer ||
          (config.theme && config.theme.footer) ||
          (config.botName + ' • Powered by ' + config.company),
        iconURL: opts.footerIcon || undefined
      })
      .setTimestamp();

    if (opts.author) {
      embed.setAuthor(opts.author);
    } else if (opts.authorName || opts.authorIcon) {
      embed.setAuthor({
        name: opts.authorName || config.botName,
        iconURL: opts.authorIcon || undefined
      });
    }

    if (opts.title) embed.setTitle(opts.title);
    if (opts.description) embed.setDescription(opts.description);
    if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
    if (opts.image) embed.setImage(opts.image);
    if (opts.fields) embed.addFields(opts.fields);

    return embed;
  }

  static success(title, description) {
    return this.base({
      color: config.colors.success,
      title: emoji('success') + ' ' + title,
      description: description
    });
  }

  static error(title, description) {
    return this.base({
      color: config.colors.danger,
      title: emoji('error') + ' ' + title,
      description: description
    });
  }

  static warning(title, description) {
    return this.base({
      color: config.colors.warning,
      title: emoji('warning') + ' ' + title,
      description: description
    });
  }

  static info(title, description) {
    return this.base({
      color: config.colors.primary,
      title: emoji('info') + ' ' + title,
      description: description
    });
  }

  static moderationAction(options) {
    const opts = options || {};
    const action = typeof opts.action === 'string' ? opts.action : 'Action';
    const target = opts.target;
    const moderator = opts.moderator;
    const reason = opts.reason ? opts.reason : 'No reason provided.';
    const duration = opts.duration;
    const targetId = target && target.id ? String(target.id) : 'Unknown';

    const embed = this.base({
      color: action.toLowerCase().indexOf('ban') !== -1
        ? config.colors.danger
        : config.colors.warning,
      title: emoji('shield') + ' Moderation Action — ' + action.toUpperCase(),
      description: [
        section('Action Details'),
        line('user', 'Target', userTag(target)),
        line('mention', 'Mention', targetId === 'Unknown' ? 'Unknown' : '<@' + targetId + '>'),
        line('id', 'User ID', targetId),
        '',
        section('Additional Info'),
        line('added_by', 'Moderator', userTag(moderator)),
        line('warn', 'Reason', String(reason)),
        line('timestamp', 'Timestamp', '<t:' + Math.floor(Date.now() / 1000) + ':F>')
      ].join('\n')
    });

    if (duration) {
      embed.addFields(field('expiry', 'Duration', String(duration), true));
    }

    return embed;
  }

  static accessGrant(options) {
    const opts = options || {};
    const target = opts.target;
    const moderator = opts.moderator;
    const targetId = target && target.id ? String(target.id) : 'Unknown';
    const expiry = opts.expiry instanceof Date
      ? formatStamp(opts.expiry)
      : (opts.expiry || 'Never');
    const timestamp = opts.timestamp instanceof Date
      ? formatStamp(opts.timestamp)
      : (opts.timestamp || formatStamp(new Date()));

    return this.base({
      color: (config.theme && config.theme.color) || config.colors.dark,
      author: opts.author,
      authorName: opts.authorName || config.botName,
      authorIcon: opts.authorIcon,
      thumbnail: opts.thumbnail,
      description: [
        section('Added Global No Prefix:'),
        line('user', 'User', userTag(target)),
        line('mention', 'User Mention', targetId === 'Unknown' ? 'Unknown' : '<@' + targetId + '>'),
        line('id', 'User ID', targetId),
        '',
        section('Additional Info:'),
        line('added_by', 'Added By', userTag(moderator)),
        line('expiry', 'Expiry Time', expiry),
        line('timestamp', 'Timestamp', timestamp),
        '',
        '*' + (opts.note || 'DM will be sent to the user in case No Prefix is expired.') + '*'
      ].join('\n')
    });
  }

  static antinukeOverview(guild, settings) {
    const features = settings.features || {};
    const punishment = String(settings.punishment || 'ban').toUpperCase();
    const active = settings.antiNukeEnabled;

    function mark(value) {
      return status(value);
    }

    const coreActions = [
      (features.antiBan ? emoji('success') : emoji('error')) + ' **Anti Ban**',
      (features.antiKick ? emoji('success') : emoji('error')) + ' **Anti Kick**',
      (features.antiBotAdd ? emoji('success') : emoji('error')) + ' **Anti Bot Add**',
      (features.antiChannelCreate ? emoji('success') : emoji('error')) + ' **Anti Channel Create**',
      (features.antiChannelDelete ? emoji('success') : emoji('error')) + ' **Anti Channel Delete**',
      (features.antiChannelUpdate ? emoji('success') : emoji('error')) + ' **Anti Channel Update**',
      (features.antiRoleCreate ? emoji('success') : emoji('error')) + ' **Anti Role Create**',
      (features.antiRoleDelete ? emoji('success') : emoji('error')) + ' **Anti Role Delete**',
      (features.antiRoleUpdate ? emoji('success') : emoji('error')) + ' **Anti Role Update**',
      (features.antiWebhook ? emoji('success') : emoji('error')) + ' **Anti Webhook**'
    ].join('\n');

    const advancedActions = [
      (features.antiEveryone ? emoji('success') : emoji('error')) + ' **Anti @everyone / @here**',
      (features.antiGuildUpdate ? emoji('success') : emoji('error')) + ' **Anti Guild Update**',
      (features.antiIntegration ? emoji('success') : emoji('error')) + ' **Anti Integration**',
      (features.antiMemberUpdate ? emoji('success') : emoji('error')) + ' **Anti Member Update**',
      (features.antiPrune ? emoji('success') : emoji('error')) + ' **Anti Prune**',
      (features.antiDangerousPermissionUpdate ? emoji('success') : emoji('error')) + ' **Anti Dangerous Permission Update**',
      (features.antiSpam ? emoji('success') : emoji('error')) + ' **Anti Spam**',
      (features.antiLink ? emoji('success') : emoji('error')) + ' **Anti Link**',
      (features.antiChannelRecovery ? emoji('success') : emoji('error')) + ' **Anti Channel Recovery**',
      (features.antiBetrayal ? emoji('success') : emoji('error')) + ' **Anti Betrayal**',
      (features.antiAbuse ? emoji('success') : emoji('error')) + ' **Anti Abuse (EN + HI)**',
      (features.antiRaid ? emoji('success') : emoji('error')) + ' **Anti Raid**',
      (features.autoLockdown ? emoji('success') : emoji('error')) + ' **Auto Lockdown**',
      (features.autoMod ? emoji('success') : emoji('error')) + ' **AutoMod Integration**'
    ].join('\n');

    const whitelistCount = settings.whitelist ? settings.whitelist.length : 0;
    const ownerCount = settings.extraOwners ? settings.extraOwners.length : 0;
    const logChannel = settings.logChannel ? '<#' + settings.logChannel + '>' : '*Not set*';

    return new EmbedBuilder()
      .setColor(active ? ((config.theme && config.theme.color) || config.colors.dark) : config.colors.danger)
      .setAuthor({
        name: config.botName + ' Security Control Panel — ' + guild.name,
        iconURL: guild.iconURL() || undefined
      })
      .setTitle(emoji('shield') + ' Anti-Nuke Dashboard & Protection Matrix')
      .setDescription(
        section('STATUS') + '\n' + (active ? emoji('success') + ' Active' : emoji('error') + ' Disabled') + '\n\n' +
        section('BLAST RADIUS') + '\n' + (active ? emoji('success') + ' Blocked via event guards' : emoji('error') + ' Unprotected') + '\n\n' +
        section('TRUSTED BYPASS') + '\n' + emoji('user') + ' ' + whitelistCount + ' whitelist entries\n\n' +
        section('ATTACK RESPONSE') + '\n' + (active ? emoji('success') + ' Action + Logging' : emoji('error') + ' None') + '\n\n' +
        emoji('ban') + ' **Punishment:** **' + punishment + '**\n' +
        emoji('crown') + ' **Extra Owners:** **' + ownerCount + '**\n' +
        emoji('settings') + ' **Log Channel:** ' + logChannel + '\n\n' +
        emoji('warning') + ' Keep the ' + config.botName + ' role above every other role.'
      )
      .addFields(
        field('settings', 'Core Actions', coreActions, true),
        field('lightning', 'Advanced / Sensitive', advancedActions, true)
      )
      .setFooter({
        text: (config.theme && config.theme.footer ? config.theme.footer : config.botName + ' • Powered by ' + config.company) + ' | ' + config.inviteUrl,
        iconURL: guild.client && guild.client.user ? guild.client.user.displayAvatarURL() : undefined
      })
      .setTimestamp();
  }

  static antinukeAlert(data) {
    const info = data || {};
    const guild = info.guild;
    const executor = info.executor;
    const executorId = info.executorId ? String(info.executorId) : 'Unknown';
    const severity = info.severity ? String(info.severity).toUpperCase() : 'SEVERE';
    const isMinor = severity === 'MINOR';

    const embed = this.base({
      color: isMinor ? config.colors.warning : config.colors.danger,
      author: {
        name: config.botName + ' Security Core',
        iconURL: guild && guild.client && guild.client.user
          ? guild.client.user.displayAvatarURL()
          : undefined
      },
      title: emoji(isMinor ? 'warning' : 'error') + ' ' +
        (isMinor ? 'SECURITY WARNING — ' : 'SECURITY INCIDENT — ') +
        String(info.action || 'Unknown Event').toUpperCase(),
      description: isMinor
        ? 'A minor infraction was detected and handled by **' + config.botName + ' Anti-Nuke**.'
        : 'An unauthorized destructive event was detected and neutralised by **' + config.botName + ' Anti-Nuke**.',
      fields: [
        field('shield', 'Guild', guild ? guild.name + ' (' + guild.id + ')' : 'Unknown', false),
        field('user', 'Offender', executor ? userTag(executor) + ' (' + executorId + ')' : 'Unknown (' + executorId + ')', true),
        field('ban', 'Action Taken', String(info.actionTaken || 'None'), true),
        field('spark', 'Target', String(info.target || 'N/A'), false),
        field('info', 'Details', String(info.reason || 'Destructive action blocked or reversed.'), false)
      ]
    });

    if (info.ai) {
      const ai = info.ai;
      const confidence = Math.round((ai.confidence || 0) * 100);
      embed.addFields(
        field('bot', 'AI Verdict', String(ai.verdict || 'uncertain').toUpperCase() + ' (' + confidence + '%)', true),
        field('settings', 'AI Model', String(ai.model || 'deterministic-rules'), true),
        field('info', 'AI Reason', String(ai.reason || 'No AI reason provided.'), false)
      );
    }

    return embed;
  }
}

module.exports = ZyronEmbedBuilder;
