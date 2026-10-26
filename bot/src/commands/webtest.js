const webBridge = require('../api/webBridge');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];

  if (days > 0) parts.push(days + 'd');
  if (hours > 0) parts.push(hours + 'h');
  if (minutes > 0) parts.push(minutes + 'm');
  if (days === 0 && hours === 0 && minutes === 0) parts.push(seconds + 's');

  return parts.join(' ');
}

module.exports = {
  name: 'webtest',
  aliases: ['weblink', 'linktest', 'website'],
  description: 'Tests the bot API and the website link.',
  usage: '',
  ownerOnly: true,
  async execute(client, message) {
    const status = webBridge.getStatus();
    const dashboardCheck = await webBridge.checkDashboard();
    const fields = [];

    fields.push({
      name: 'Bot API',
      value: status.running ? '🟢 Online' : '🔴 Offline',
      inline: true
    });

    fields.push({
      name: 'API Port',
      value: String(status.port),
      inline: true
    });

    fields.push({
      name: 'API Key',
      value: status.keyConfigured ? '✅ Configured' : '❌ Missing',
      inline: true
    });

    fields.push({
      name: 'Bot',
      value: status.bot ? status.bot + ' • ' + status.guilds + ' servers' : 'Not ready',
      inline: false
    });

    if (status.publicUrl) {
      fields.push({
        name: 'Public API URL',
        value: status.publicUrl,
        inline: false
      });
    }

    if (status.dashboardUrl) {
      fields.push({
        name: 'Dashboard URL',
        value: status.dashboardUrl,
        inline: false
      });
    }

    if (status.lastHeartbeat) {
      const stamp = Math.floor(status.lastHeartbeat.at / 1000);
      fields.push({
        name: 'Last Dashboard Contact',
        value: '<t:' + stamp + ':F> (<t:' + stamp + ':R>)\nIP: ' +
          (status.lastHeartbeat.ip || 'unknown'),
        inline: false
      });
    } else {
      fields.push({
        name: 'Last Dashboard Contact',
        value: 'No heartbeat yet. Start the dashboard with **BOT_API_URL** and **BOT_API_KEY** set.',
        inline: false
      });
    }

    fields.push({
      name: 'Dashboard Health Check',
      value: dashboardCheck.ok
        ? '🟢 Reachable' + (dashboardCheck.status ? ' (HTTP ' + dashboardCheck.status + ')' : '')
        : '🔴 ' + (dashboardCheck.error || 'Not reachable'),
      inline: false
    });

    const linked = status.running && Boolean(status.lastHeartbeat);
    const embed = ZyronEmbedBuilder.base({
      title: '🌐 Website Link Test',
      description: linked
        ? 'The website has successfully contacted the bot. The bridge is working.'
        : 'The website link is not fully verified yet. Follow the setup fields below.',
      fields: fields
    });

    if (!status.running) {
      embed.addFields({
        name: 'Enable the bot API',
        value:
          'Add these to the bot .env:\n' +
          '**BOT_API_ENABLED=true**\n' +
          '**BOT_API_HOST=0.0.0.0**\n' +
          '**BOT_API_PORT=4000**\n' +
          '**BOT_API_KEY=make-a-long-random-secret**\n' +
          '**BOT_API_PUBLIC_URL=https://your-bot-api-domain**\n' +
          '**DASHBOARD_URL=https://your-site.netlify.app**\n' +
          'Then allocate port **4000** in Pterodactyl and restart the bot.',
        inline: false
      });
    } else {
      embed.addFields({
        name: 'Dashboard .env',
        value:
          '**BOT_API_URL=' + (status.publicUrl || 'http://localhost:4000') + '**\n' +
          '**BOT_API_KEY=the same secret as the bot .env**\n' +
          '**DASHBOARD_PUBLIC_URL=https://your-site.netlify.app**\n' +
          'Run **.webtest** again after the dashboard has loaded once.',
        inline: false
      });
    }

    embed.addFields({
      name: 'API Uptime',
      value: status.running ? formatDuration(status.uptimeMs) : 'Offline',
      inline: true
    });

    embed.addFields({
      name: 'Requests Handled',
      value: String(status.requestCount || 0),
      inline: true
    });

    return message.reply({ embeds: [embed] });
  }
};
