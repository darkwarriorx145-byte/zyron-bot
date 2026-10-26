const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

function userTag(target) {
  if (!target) return 'Unknown';
  const user = target.user ? target.user : target;
  if (user.tag) return user.tag;
  if (user.username) return user.username;
  return String(target.id ? target.id : target);
}

class ZyronEmbedBuilder {
  static base(options) {
    const opts = options || {};
    const embed = new EmbedBuilder()
      .setColor(opts.color || config.colors.primary)
      .setFooter({
        text: config.botName + ' • Powered by ' + config.company,
        iconURL: opts.footerIcon || undefined
      })
      .setTimestamp();

    if (opts.title) embed.setTitle(opts.title);
    if (opts.description) embed.setDescription(opts.description);
    if (opts.author) embed.setAuthor(opts.author);
    if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
    if (opts.image) embed.setImage(opts.image);
    if (opts.fields) embed.addFields(opts.fields);

    return embed;
  }

  static success(title, description) {
    return this.base({
      color: config.colors.success,
      title: '✅ ' + title,
      description: description
    });
  }

  static error(title, description) {
    return this.base({
      color: config.colors.danger,
      title: '❌ ' + title,
      description: description
    });
  }

  static warning(title, description) {
    return this.base({
      color: config.colors.warning,
      title: '⚠️ ' + title,
      description: description
    });
  }

  static info(title, description) {
    return this.base({
      color: config.colors.primary,
      title: 'ℹ️ ' + title,
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

    const embed = this.base({
      color: action.toLowerCase().indexOf('ban') !== -1 ? config.colors.danger : config.colors.warning,
      title: '🛡️ Moderation Action — ' + action.toUpperCase(),
      description: 'A moderation disciplinary action has been executed.'
    });

    embed.addFields(
      { name: '👤 Target User', value: userTag(target), inline: true },
      { name: '👮 Moderator', value: userTag(moderator), inline: true },
      { name: '📝 Reason', value: String(reason), inline: false }
    );

    if (duration) {
      embed.addFields({ name: '⏱️ Duration', value: String(duration), inline: true });
    }

    return embed;
  }

  static antinukeOverview(guild, settings) {
    const features = settings.features || {};
    const punishment = String(settings.punishment || 'ban').toUpperCase();
    const active = settings.antiNukeEnabled;

    function mark(value) {
      return value ? '🟢 **ON**' : '🔴 **OFF**';
    }

    const coreActions = [
      (features.antiBan ? '🟢 ' : '🔴 ') + '**Anti Ban**',
      (features.antiKick ? '🟢 ' : '🔴 ') + '**Anti Kick**',
      (features.antiBotAdd ? '🟢 ' : '🔴 ') + '**Anti Bot Add**',
      (features.antiChannelCreate ? '🟢 ' : '🔴 ') + '**Anti Channel Create**',
      (features.antiChannelDelete ? '🟢 ' : '🔴 ') + '**Anti Channel Delete**',
      (features.antiChannelUpdate ? '🟢 ' : '🔴 ') + '**Anti Channel Update**',
      (features.antiRoleCreate ? '🟢 ' : '🔴 ') + '**Anti Role Create**',
      (features.antiRoleDelete ? '🟢 ' : '🔴 ') + '**Anti Role Delete**',
      (features.antiRoleUpdate ? '🟢 ' : '🔴 ') + '**Anti Role Update**',
      (features.antiWebhook ? '🟢 ' : '🔴 ') + '**Anti Webhook**'
    ].join('\n');

    const advancedActions = [
      (features.antiEveryone ? '🟢 ' : '🔴 ') + '**Anti @everyone / @here**',
      (features.antiGuildUpdate ? '🟢 ' : '🔴 ') + '**Anti Guild Update**',
      (features.antiIntegration ? '🟢 ' : '🔴 ') + '**Anti Integration**',
      (features.antiMemberUpdate ? '🟢 ' : '🔴 ') + '**Anti Member Update**',
      (features.antiPrune ? '🟢 ' : '🔴 ') + '**Anti Prune**',
      (features.antiDangerousPermissionUpdate ? '🟢 ' : '🔴 ') + '**Anti Dangerous Permission Update**',
      (features.antiSpam ? '🟢 ' : '🔴 ') + '**Anti Spam**',
      (features.antiLink ? '🟢 ' : '🔴 ') + '**Anti Link**',
      (features.antiChannelRecovery ? '🟢 ' : '🔴 ') + '**Anti Channel Recovery**',
      (features.antiBetrayal ? '🟢 ' : '🔴 ') + '**Anti Betrayal**',
      (features.antiAbuse ? '🟢 ' : '🔴 ') + '**Anti Abuse (EN + HI)**',
      (features.antiRaid ? '🟢 ' : '🔴 ') + '**Anti Raid**',
      (features.autoLockdown ? '🟢 ' : '🔴 ') + '**Auto Lockdown**',
      (features.autoMod ? '🟢 ' : '🔴 ') + '**AutoMod Integration**'
    ].join('\n');

    const whitelistCount = settings.whitelist ? settings.whitelist.length : 0;
    const ownerCount = settings.extraOwners ? settings.extraOwners.length : 0;
    const logChannel = settings.logChannel ? '<#' + settings.logChannel + '>' : '*Not set*';

    const embed = new EmbedBuilder()
      .setColor(active ? '#2B2D31' : config.colors.danger)
      .setAuthor({
        name: config.botName + ' Security Control Panel — ' + guild.name,
        iconURL: guild.iconURL() || undefined
      })
      .setTitle('🛡️ Anti-Nuke Dashboard & Protection Matrix')
      .setDescription(
        '**STATUS**\n' + (active ? '🟢 Active' : '🔴 Disabled') + '\n\n' +
        '**BLAST RADIUS**\n' + (active ? '🟢 Blocked via event guards' : '🔴 Unprotected') + '\n\n' +
        '**TRUSTED BYPASS**\n' + whitelistCount + ' whitelist entries\n\n' +
        '**ATTACK RESPONSE**\n' + (active ? '🟢 Action + Logging' : '🔴 None') + '\n\n' +
        '**Punishment:** **' + punishment + '**\n' +
        '**Extra Owners:** **' + ownerCount + '**\n' +
        '**Log Channel:** ' + logChannel + '\n\n' +
        '⚠️ Keep the ' + config.botName + ' role above every other role.'
      )
      .addFields(
        { name: '⚙️ Core Actions', value: coreActions, inline: true },
        { name: '⚡ Advanced / Sensitive', value: advancedActions, inline: true }
      )
      .setFooter({
        text: config.botName + ' • Powered by ' + config.company + ' | ' + config.inviteUrl,
        iconURL: guild.client && guild.client.user ? guild.client.user.displayAvatarURL() : undefined
      })
      .setTimestamp();

    return embed;
  }

  static antinukeAlert(data) {
    const info = data || {};
    const guild = info.guild;
    const executor = info.executor;
    const executorId = info.executorId ? String(info.executorId) : 'Unknown';
    const severity = info.severity ? String(info.severity).toUpperCase() : 'SEVERE';
    const isMinor = severity === 'MINOR';

    const embed = new EmbedBuilder()
      .setColor(isMinor ? config.colors.warning : config.colors.danger)
      .setAuthor({
        name: config.botName + ' Security Core',
        iconURL: guild && guild.client && guild.client.user ? guild.client.user.displayAvatarURL() : undefined
      })
      .setTitle((isMinor ? '⚠️ SECURITY WARNING — ' : '🚨 SECURITY INCIDENT — ') + String(info.action || 'Unknown Event').toUpperCase())
      .setDescription(
        isMinor
          ? 'A minor infraction was detected and handled by **' + config.botName + ' Anti-Nuke**.'
          : 'An unauthorized destructive event was detected and neutralised by **' + config.botName + ' Anti-Nuke**.'
      )
      .addFields(
        { name: '🛡️ Guild', value: guild ? guild.name + ' (' + guild.id + ')' : 'Unknown', inline: false },
        { name: '👤 Offender', value: executor ? userTag(executor) + ' (' + executorId + ')' : 'Unknown (' + executorId + ')', inline: true },
        { name: '🔨 Action Taken', value: String(info.actionTaken || 'None'), inline: true },
        { name: '🎯 Target', value: String(info.target || 'N/A'), inline: false },
        { name: '📜 Details', value: String(info.reason || 'Destructive action blocked or reversed.'), inline: false }
      )
      .setFooter({
        text: config.botName + ' • Powered by ' + config.company,
        iconURL: guild && guild.client && guild.client.user ? guild.client.user.displayAvatarURL() : undefined
      })
      .setTimestamp();

    if (info.ai) {
      const ai = info.ai;
      const confidence = Math.round((ai.confidence || 0) * 100);
      embed.addFields(
        {
          name: '🧠 AI Verdict',
          value: String(ai.verdict || 'uncertain').toUpperCase() + ' (' + confidence + '%)',
          inline: true
        },
        {
          name: '🤖 AI Model',
          value: String(ai.model || 'deterministic-rules'),
          inline: true
        },
        {
          name: '💬 AI Reason',
          value: String(ai.reason || 'No AI reason provided.'),
          inline: false
        }
      );
    }

    return embed;
  }
}

module.exports = ZyronEmbedBuilder;
