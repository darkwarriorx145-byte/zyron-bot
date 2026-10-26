const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType
} = require('discord.js');
const config = require('../../config.json');

const MENU_ID = 'zyron_help_menu';
const MENU_TIMEOUT = 180000;

const CATEGORIES = [
  {
    value: 'moderation',
    label: 'Moderation',
    emoji: '🛡️',
    description: 'Ban, kick, warn, timeout and warning tools.',
    blurb: 'Keep your server safe with complete member management.',
    commands: ['ban', 'unban', 'kick', 'warn', 'warnings', 'clearwarnings', 'timeout', 'untimeout']
  },
  {
    value: 'antinuke',
    label: 'Anti-Nuke',
    emoji: '⚙️',
    description: 'Core protections, whitelist and per-feature whitelist.',
    blurb: 'Stop nukers before they destroy your server.',
    commands: ['antinuke', 'featurewl']
  },
  {
    value: 'ai',
    label: 'AI Engine',
    emoji: '🧠',
    description: 'OpenRouter AI second opinion for nukes, raids and abuse.',
    blurb: 'AI confirms threats before Zyron acts, and clears false alarms.',
    commands: ['ai']
  },
  {
    value: 'automod',
    label: 'AutoMod & Filters',
    emoji: '🤖',
    description: 'Discord native AutoMod, profanity, anti-spam, anti-link.',
    blurb: 'Filter profanity, spam, links and mention abuse automatically.',
    commands: ['automod'],
    subcommands: ['status', 'setup', 'remove', 'on', 'off', 'abuse', 'spam', 'link', 'everyone', 'punishment', 'test']
  },
  {
    value: 'antiraid',
    label: 'Anti-Raid',
    emoji: '🚨',
    description: 'Mass join detection and raid punishment.',
    blurb: 'Stop mass join raids with automatic kick or ban.',
    commands: ['automod'],
    subcommands: ['raid', 'raidpunish']
  },
  {
    value: 'antipetrayal',
    label: 'Anti-Betrayal',
    emoji: '🕵️',
    description: 'Rogue owner and staff detection.',
    blurb: 'Catch trusted teammates who turn destructive.',
    commands: ['automod'],
    subcommands: ['betrayal']
  },
  {
    value: 'emergency',
    label: 'Auto-Emergency',
    emoji: '🔒',
    description: 'Automatic lockdown and emergency controls.',
    blurb: 'Lock the server instantly when a punishment fails or a raid hits.',
    commands: ['automod', 'lockdown', 'unlockdown'],
    subcommands: ['lockdown']
  },
  {
    value: 'economy',
    label: 'Economy',
    emoji: '💰',
    description: 'Daily rewards, coins, transfers and leaderboard.',
    blurb: 'Earn coins daily, send to friends, climb the leaderboard.',
    commands: ['economy']
  },
  {
    value: 'community',
    label: 'Community',
    emoji: '🎉',
    description: 'Tickets, polls, giveaways and staff applications.',
    blurb: 'Engage and support your members.',
    commands: ['ticket', 'poll', 'giveaway', 'staff-apply']
  },
  {
    value: 'utility',
    label: 'Utility',
    emoji: '📋',
    description: 'Purge, lock, unlock, autorole and profile.',
    blurb: 'Everyday tools to keep channels clean and roles automatic.',
    commands: ['purge', 'lock', 'unlock', 'autorole', 'invites', 'profile']
  },
  {
    value: 'information',
    label: 'Information',
    emoji: 'ℹ️',
    description: 'Help menu, invite link, bot details and bot owners.',
    blurb: 'Everything you need to know about Zyron.',
    commands: ['help', 'owner', 'webtest']
  }
];

function getPrefix(message) {
  let prefix = config.prefix;
  try {
    const db = require('../database/db');
    const settings = db.getGuild(message.guild.id);
    if (settings && settings.prefix) prefix = settings.prefix;
  } catch (err) {
    prefix = config.prefix;
  }
  return prefix;
}

function buildMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(MENU_ID)
    .setPlaceholder('Select a help category...')
    .setMinValues(1)
    .setMaxValues(1);

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(cat.label)
        .setDescription(cat.description)
        .setEmoji(cat.emoji)
        .setValue(cat.value)
    );
  }

  menu.addOptions(
    new StringSelectMenuOptionBuilder()
      .setLabel('Home')
      .setDescription('Go back to the main help page.')
      .setEmoji('🏠')
      .setValue('home')
  );

  return new ActionRowBuilder().addComponents(menu);
}

function buildHome(client, prefix, user) {
  const fields = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    fields.push({
      name: cat.emoji + ' ' + cat.label,
      value: cat.blurb,
      inline: false
    });
  }
  
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setAuthor({
      name: config.botName + ' • Help Center',
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle('🛡️ ' + config.botName + ' Help Menu')
    .setDescription(
      'Hey **' + user.username + '**, welcome to **' + config.botName + '**.\n' +
      'A complete moderation & anti-nuke bot built to protect your server.\n\n' +
      '**Prefix:** ' + prefix + '\n' +
      '**Total Commands:** ' + client.commands.size + '\n' +
      '**Protecting:** ' + client.guilds.cache.size + ' servers\n\n' +
      'Pick a category from the dropdown below to see its commands.'
    )
    .setThumbnail(client.user.displayAvatarURL())
    .addFields(fields)
    .setFooter({
      text: config.botName + ' • Powered by ' + config.company,
      iconURL: client.user.displayAvatarURL()
    })
    .setTimestamp();
}

function buildCategory(client, prefix, category, member) {
  const user = member.user;
  const fields = [];

  for (let i = 0; i < category.commands.length; i++) {
    const name = category.commands[i];
    const command = client.commands.get(name);
    if (!command) continue;

    // Owner-only commands are hidden from everyone except the main owner.
    if (command.ownerOnly && member.user.id !== String(process.env.DEFAULT_OWNER_ID || '')) {
      continue;
    }

    // Permission check: skip commands the member cannot use
    if (command.permissions && command.permissions.length > 0) {
      const hasPerm = command.permissions.some(function (p) {
        return member.permissions.has(p);
      });
      if (!hasPerm) continue;
    }

    if (command.subcommands && command.subcommands.length > 0) {
      for (let s = 0; s < command.subcommands.length; s++) {
        const sub = command.subcommands[s];
        const subKey = sub.name.split(' ')[0];

        if (sub.admin && !member.permissions.has('ManageGuild')) {
          continue;
        }

        if (category.subcommands && category.subcommands.indexOf(subKey) === -1) {
          continue;
        }

        fields.push({
          name: prefix + command.name + ' ' + sub.name,
          value: sub.description,
          inline: false
        });
      }
      continue;
    }

    const usage = command.usage ? command.usage : '';
    fields.push({
      name: prefix + command.name,
      value: command.description + '\n**Usage:** ' + prefix + command.name + ' ' + usage,
      inline: false
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: 'No commands available',
      value: 'You do not have the required permissions to use any commands in this category.',
      inline: false
    });
  }

  // Pagination: 25 max fields per embed
  const pages = [];
  const perPage = 25;
  for (let i = 0; i < fields.length; i += perPage) {
    pages.push(fields.slice(i, i + perPage));
  }

  return pages.map(function (pageFields, index) {
    const pageLabel = pages.length > 1 ? ' — Page ' + (index + 1) + '/' + pages.length : '';

    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setAuthor({
        name: config.botName + ' • Help Center',
        iconURL: client.user.displayAvatarURL()
      })
      .setTitle(category.emoji + ' ' + category.label + ' Commands' + pageLabel)
      .setDescription(category.blurb)
      .addFields(pageFields)
      .setFooter({
        text: 'Requested by ' + user.username + ' • Use the dropdown to switch category',
        iconURL: user.displayAvatarURL()
      })
      .setTimestamp();
  });
}

function buildCommandInfo(client, prefix, command, user) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setAuthor({
      name: config.botName + ' • Help Center',
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle('📖 Command Info — ' + prefix + command.name)
    .setDescription(command.description)
    .addFields(
      {
        name: 'Usage',
        value: prefix + command.name + ' ' + (command.usage ? command.usage : ''),
        inline: false
      },
      {
        name: 'Aliases',
        value: command.aliases && command.aliases.length > 0 ? command.aliases.join(', ') : 'None',
        inline: true
      },
      {
        name: 'Owner Only',
        value: command.ownerOnly ? 'Yes' : 'No',
        inline: true
      }
    )
    .setFooter({
      text: 'Requested by ' + user.username + ' • ' + config.botName + ' • Powered by ' + config.company,
      iconURL: user.displayAvatarURL()
    })
    .setTimestamp();

  if (command.subcommands && command.subcommands.length > 0) {
    const lines = command.subcommands.map(function (sub) {
      return prefix + command.name + ' ' + sub.name + ' — ' + sub.description;
    });
    embed.addFields({
      name: 'Subcommands (' + command.subcommands.length + ')',
      value: lines.join('\n'),
      inline: false
    });
  }

  return embed;
}

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Shows the interactive Zyron help menu with a category dropdown.',
  usage: '[command]',
  async execute(client, message, args) {
    const prefix = getPrefix(message);

    if (args && args.length > 0) {
      const search = args[0].toLowerCase();
      const command = client.commands.get(search) ||
        client.commands.find(function (cmd) {
          return cmd.aliases && cmd.aliases.indexOf(search) !== -1;
        });

      if (!command) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle('❌ Command Not Found')
              .setDescription('I could not find a command called **' + search + '**.\nRun ' + prefix + 'help to open the menu.')
          ]
        });
      }

      return message.channel.send({ embeds: [buildCommandInfo(client, prefix, command, message.author)] });
    }

    const sentMessage = await message.channel.send({
      embeds: [buildHome(client, prefix, message.author)],
      components: [buildMenu()]
    });

    const collector = sentMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: MENU_TIMEOUT
    });

    collector.on('collect', async function (interaction) {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: 'This help menu belongs to **' + message.author.username + '**. Run ' + prefix + 'help to open your own.',
          ephemeral: true
        }).catch(function () {});
      }

      const value = interaction.values[0];

      try {
        if (value === 'home') {
          return await interaction.update({
            embeds: [buildHome(client, prefix, message.author)],
            components: [buildMenu()]
          });
        }

        const category = CATEGORIES.find(function (cat) {
          return cat.value === value;
        });

        if (!category) {
          return await interaction.update({
            embeds: [buildHome(client, prefix, message.author)],
            components: [buildMenu()]
          });
        }

        // Permission-aware: pass member to filter commands
        const pages = buildCategory(client, prefix, category, interaction.member);
        return await interaction.update({
          embeds: pages,
          components: [buildMenu()]
        });
      } catch (err) {
        console.error('Help menu interaction error:', err);
      }
    });

    collector.on('end', function () {
      sentMessage.edit({ components: [] }).catch(function () {});
    });
  }
};