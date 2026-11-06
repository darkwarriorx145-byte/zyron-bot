const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const pterodactyl = require('../utils/pterodactyl');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

const activeCreateSessions = new Map();

function getPanel(guildId) {
  return pterodactyl.getPanelConfig(guildId);
}

async function fetchCreateData(guildId) {
  const panel = getPanel(guildId);
  if (!panel) throw new Error('No Pterodactyl panel linked. Use .integrations add pterodactyl <url> <apiKey>.');
  const data = await pterodactyl.getAllDataForCreate(panel);
  return { panel, nests: data.nests, locations: data.locations.data || [] };
}

async function fetchEggsForNest(guildId, nestId) {
  const panel = getPanel(guildId);
  if (!panel) throw new Error('No Pterodactyl panel linked.');
  return pterodactyl.getEggsForNest(panel, nestId);
}

async function fetchEggVariables(guildId, nestId, eggId) {
  const panel = getPanel(guildId);
  if (!panel) throw new Error('No Pterodactyl panel linked.');
  return pterodactyl.getVariablesForEgg(panel, nestId, eggId);
}

async function createServer(guildId, payload) {
  const panel = getPanel(guildId);
  if (!panel) throw new Error('No Pterodactyl panel linked.');
  return pterodactyl.createServer(panel, payload);
}

module.exports = {
  name: 'petro',
  aliases: ['pterodactyl', 'panel'],
  description: 'Create and manage Pterodactyl servers.',
  permissions: [PermissionsBitField.Flags.ManageGuild],
  usage: '<create|list|eggs|nests|locations>',
  subcommands: [
    { name: 'create', description: 'Create a new Pterodactyl server (interactive modal).' },
    { name: 'list', description: 'List servers on the linked panel.' },
    { name: 'nests', description: 'Show available nests.' },
    { name: 'eggs <nestId>', description: 'Show eggs in a nest.' },
    { name: 'locations', description: 'Show available locations.' },
    { name: 'variables <nestId> <eggId>', description: 'Show startup variables for an egg.' }
  ],

  async execute(client, message, args) {
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const sub = (args[0] || 'create').toLowerCase();

    if (sub === 'create') {
      return this.startCreate(message);
    }

    if (sub === 'list') {
      const panel = getPanel(message.guild.id);
      if (!panel) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Panel Linked', 'Use ' + prefix + 'integrations add pterodactyl <url> <apiKey> to link a panel.')] });
      try {
        const res = await pterodactyl.request(panel, '/api/application/servers', { method: 'GET' });
        const servers = (res.data.data || []).map(function (s) { return s.attributes; });
        if (!servers.length) return message.reply({ embeds: [ZyronEmbedBuilder.info('No Servers', 'No servers found on the panel.')] });
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🦖 Pterodactyl Servers')
            .setDescription(servers.slice(0, 20).map(function (s) {
              return '**' + s.name + '** (`' + s.uuid + '`)\n' +
                'Node: ' + s.node + ' • Limits: ' + s.limits.memory + 'MB RAM, ' + s.limits.cpu + '% CPU, ' + s.limits.disk + 'MB Disk' +
                (s.allocation ? ' • Allocation: ' + s.allocation.ip + ':' + s.allocation.port : '');
            }).join('\n\n'))
            .setFooter({ text: servers.length > 20 ? 'Showing first 20 of ' + servers.length : '' })
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to List', err.message)] });
      }
    }

    if (sub === 'nests') {
      const panel = getPanel(message.guild.id);
      if (!panel) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Panel Linked', 'Use ' + prefix + 'integrations add pterodactyl <url> <apiKey>.')] });
      try {
        const nests = await pterodactyl.listAllNests(panel);
        if (!nests.length) return message.reply({ embeds: [ZyronEmbedBuilder.info('No Nests', 'No nests found on the panel.')] });
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🦖 Available Nests')
            .setDescription(nests.map(function (n) { return '**' + n.name + '** (`' + n.id + '`) — ' + (n.description || 'No description'); }).join('\n\n'))
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to List Nests', err.message)] });
      }
    }

    if (sub === 'eggs') {
      const nestId = args[1];
      if (!nestId) return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Nest ID', 'Use ' + prefix + 'petro eggs <nestId>. See ' + prefix + 'petro nests.')] });
      const panel = getPanel(message.guild.id);
      if (!panel) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Panel Linked', 'Use ' + prefix + 'integrations add pterodactyl <url> <apiKey>.')] });
      try {
        const { eggs, nest } = await pterodactyl.getEggsForNest(panel, nestId);
        if (!eggs.length) return message.reply({ embeds: [ZyronEmbedBuilder.info('No Eggs', 'No eggs found in nest ' + nestId + '.')] });
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🦖 Eggs in ' + nest.name)
            .setDescription(eggs.map(function (e) { return '**' + e.name + '** (`' + e.id + '`) — ' + (e.description || 'No description'); }).join('\n\n'))
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to List Eggs', err.message)] });
      }
    }

    if (sub === 'locations') {
      const panel = getPanel(message.guild.id);
      if (!panel) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Panel Linked', 'Use ' + prefix + 'integrations add pterodactyl <url> <apiKey>.')] });
      try {
        const res = await pterodactyl.listLocations(panel);
        const locations = res.data.data || [];
        if (!locations.length) return message.reply({ embeds: [ZyronEmbedBuilder.info('No Locations', 'No locations found on the panel.')] });
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🦖 Available Locations')
            .setDescription(locations.map(function (l) { return '**' + l.attributes.name + '** (`' + l.attributes.id + '`) — ' + (l.attributes.description || 'No description'); }).join('\n\n'))
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to List Locations', err.message)] });
      }
    }

    if (sub === 'variables') {
      const nestId = args[1];
      const eggId = args[2];
      if (!nestId || !eggId) return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing IDs', 'Use ' + prefix + 'petro variables <nestId> <eggId>.')] });
      const panel = getPanel(message.guild.id);
      if (!panel) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Panel Linked', 'Use ' + prefix + 'integrations add pterodactyl <url> <apiKey>.')] });
      try {
        const vars = await pterodactyl.getVariablesForEgg(panel, nestId, eggId);
        const fields = (vars.startup_variables || []).map(function (v) {
          return '**' + v.env_variable + '**: ' + (v.description || 'No description') + ' — Default: `' + (v.default_value || '') + '`' + (v.required ? ' (Required)' : '');
        });
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🦖 Startup Variables for ' + vars.name)
            .setDescription(fields.length ? fields.join('\n\n') : 'No variables defined.')
            .setTimestamp()]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to Get Variables', err.message)] });
      }
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'petro create|list|nests|eggs|locations|variables.')] });
  },

  async startCreate(message) {
    try {
      const { nests, locations } = await fetchCreateData(message.guild.id);
      if (!nests.length) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Nests', 'No nests found on the linked panel.')] });
      if (!locations.length) return message.reply({ embeds: [ZyronEmbedBuilder.error('No Locations', 'No locations found on the linked panel.')] });

      const sessionId = message.author.id + ':' + message.channel.id;
      const session = {
        step: 'nest',
        guildId: message.guild.id,
        userId: message.author.id,
        channelId: message.channel.id,
        data: {},
        nests: nests,
        locations: locations,
        message: null
      };
      activeCreateSessions.set(sessionId, session);

      await this.showNestSelect(message, session);
    } catch (err) {
      return message.reply({ embeds: [ZyronEmbedBuilder.error('Failed to Load Data', err.message)] });
    }
  },

  async showNestSelect(message, session) {
    const nestOptions = session.nests.slice(0, 25).map(function (n) {
      return { label: n.name.slice(0, 100), value: String(n.id), description: (n.description || 'No description').slice(0, 100) };
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId('petro:nest_select')
      .setPlaceholder('Select a nest (server type)...')
      .addOptions(nestOptions);

    const row = new ActionRowBuilder().addComponents(select);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🦖 Create Pterodactyl Server — Step 1/5')
      .setDescription('Select the nest (server type) for your new server.')
      .addFields({ name: 'Nests available', value: String(session.nests.length) })
      .setFooter({ text: 'Zyron • Powered by Zyra Nodes Limited' })
      .setTimestamp();

    if (session.message) {
      await session.message.edit({ embeds: [embed], components: [row] });
    } else {
      session.message = await message.reply({ embeds: [embed], components: [row] });
    }
  },

  async showEggSelect(interaction, session) {
    const eggOptions = session.eggs.slice(0, 25).map(function (e) {
      return { label: e.name.slice(0, 100), value: String(e.id), description: (e.description || 'No description').slice(0, 100) };
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId('petro:egg_select')
      .setPlaceholder('Select an egg (server version)...')
      .addOptions(eggOptions);

    const row = new ActionRowBuilder().addComponents(select);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🦖 Create Pterodactyl Server — Step 2/5')
      .setDescription('Nest: **' + session.data.nestName + '**\nSelect the egg (specific version/config) for your server.')
      .addFields({ name: 'Eggs available', value: String(session.eggs.length) })
      .setFooter({ text: 'Zyron • Powered by Zyra Nodes Limited' })
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [row] });
  },

  async showVariablesModal(interaction, session) {
    const requiredVars = (session.eggVariables || []).filter(function (v) { return v.required; });
    const optionalVars = (session.eggVariables || []).filter(function (v) { return !v.required; });

    const modal = new ModalBuilder()
      .setCustomId('petro:variables_modal')
      .setTitle('Egg Variables — ' + session.data.eggName);

    const inputs = [];

    if (requiredVars.length) {
      const firstFive = requiredVars.slice(0, 5);
      firstFive.forEach(function (v) {
        inputs.push(new TextInputBuilder()
          .setCustomId('var_' + v.env_variable)
          .setLabel(v.env_variable.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Default: ' + (v.default_value || 'none') + (v.description ? ' — ' + v.description.slice(0, 50) : ''))
          .setValue(v.default_value || '')
          .setRequired(true));
      });
    }

    if (optionalVars.length && inputs.length < 5) {
      const firstOptional = optionalVars.slice(0, 5 - inputs.length);
      firstOptional.forEach(function (v) {
        inputs.push(new TextInputBuilder()
          .setCustomId('var_' + v.env_variable)
          .setLabel(v.env_variable.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Default: ' + (v.default_value || 'none') + (v.description ? ' — ' + v.description.slice(0, 50) : ''))
          .setValue(v.default_value || '')
          .setRequired(false));
      });
    }

    inputs.forEach(function (input) {
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    await interaction.showModal(modal);
  },

  async showDetailsModal(interaction, session) {
    const modal = new ModalBuilder()
      .setCustomId('petro:details_modal')
      .setTitle('Server Details — ' + session.data.eggName);

    const nameInput = new TextInputBuilder()
      .setCustomId('server_name')
      .setLabel('Server Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('My Awesome Server')
      .setRequired(true)
      .setMaxLength(100);

    const ownerInput = new TextInputBuilder()
      .setCustomId('server_owner')
      .setLabel('Owner (Discord ID or @mention)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('User ID or @user')
      .setRequired(true)
      .setMaxLength(25);

    const locationInput = new TextInputBuilder()
      .setCustomId('server_location')
      .setLabel('Location ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('See .petro locations for IDs')
      .setRequired(true)
      .setMaxLength(25);

    const memoryInput = new TextInputBuilder()
      .setCustomId('server_memory')
      .setLabel('Memory Limit (MB)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1024')
      .setRequired(true)
      .setMaxLength(10);

    const cpuInput = new TextInputBuilder()
      .setCustomId('server_cpu')
      .setLabel('CPU Limit (%)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('100')
      .setRequired(true)
      .setMaxLength(10);

    const diskInput = new TextInputBuilder()
      .setCustomId('server_disk')
      .setLabel('Disk Limit (MB)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('5120')
      .setRequired(true)
      .setMaxLength(10);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(ownerInput),
      new ActionRowBuilder().addComponents(locationInput),
      new ActionRowBuilder().addComponents(memoryInput),
      new ActionRowBuilder().addComponents(cpuInput)
    );

    await interaction.showModal(modal);
  },

  async showConfirmation(interaction, session) {
    const owner = await interaction.client.users.fetch(session.data.ownerId).catch(function () { return { tag: 'Unknown (' + session.data.ownerId + ')' }; });

    const location = session.locations.find(function (l) { return String(l.attributes.id) === session.data.locationId; });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🦖 Confirm Server Creation')
      .setDescription('Review the details before creating the server.')
      .addFields(
        { name: 'Nest', value: session.data.nestName, inline: true },
        { name: 'Egg', value: session.data.eggName, inline: true },
        { name: 'Server Name', value: session.data.serverName, inline: true },
        { name: 'Owner', value: owner.tag, inline: true },
        { name: 'Location', value: location ? location.attributes.name + ' (`' + location.attributes.id + '`)' : 'Unknown', inline: true },
        { name: 'Limits', value: session.data.memory + 'MB RAM · ' + session.data.cpu + '% CPU · ' + session.data.disk + 'MB Disk', inline: true },
        { name: 'Variables', value: Object.keys(session.data.variables).length + ' configured', inline: true }
      )
      .setFooter({ text: 'Zyron • Powered by Zyra Nodes Limited' })
      .setTimestamp();

    const confirmBtn = new ButtonBuilder()
      .setCustomId('petro:confirm_create')
      .setLabel('Create Server')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const cancelBtn = new ButtonBuilder()
      .setCustomId('petro:cancel_create')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');

    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    await interaction.update({ embeds: [embed], components: [row] });
  },

  handleInteraction(client, interaction) {
    const sessionId = interaction.user.id + ':' + interaction.channel.id;
    const session = activeCreateSessions.get(sessionId);

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'petro:nest_select') {
        if (!session || session.userId !== interaction.user.id) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Session Expired', 'Start over with .petro create.')], ephemeral: true });
        }
        const nestId = interaction.values[0];
        const nest = session.nests.find(function (n) { return String(n.id) === nestId; });
        if (!nest) return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Nest', 'Please select again.')], ephemeral: true });
        session.data.nestId = nestId;
        session.data.nestName = nest.name;
        session.step = 'egg';
        return fetchEggsForNest(session.guildId, nestId).then(function (result) {
          const { eggs } = result;
          if (!eggs.length) {
            return interaction.reply({ embeds: [ZyronEmbedBuilder.error('No Eggs', 'This nest has no eggs. Choose another nest.')], ephemeral: true });
          }
          session.eggs = eggs;
          return this.showEggSelect(interaction, session);
        }.bind(this)).catch(function (err) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Failed to Load Eggs', err.message)], ephemeral: true });
        });
      }
      if (interaction.customId === 'petro:egg_select') {
        if (!session || session.userId !== interaction.user.id) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Session Expired', 'Start over with .petro create.')], ephemeral: true });
        }
        const eggId = interaction.values[0];
        const egg = session.eggs.find(function (e) { return String(e.id) === eggId; });
        if (!egg) return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Egg', 'Please select again.')], ephemeral: true });
        session.data.eggId = eggId;
        session.data.eggName = egg.name;
        session.step = 'variables';
        return fetchEggVariables(session.guildId, session.data.nestId, eggId).then(function (vars) {
          session.eggVariables = vars.startup_variables || [];
          return this.showVariablesModal(interaction, session);
        }.bind(this)).catch(function (err) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Failed to Load Variables', err.message)], ephemeral: true });
        });
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'petro:variables_modal') {
        if (!session || session.userId !== interaction.user.id) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Session Expired', 'Start over with .petro create.')], ephemeral: true });
        }
        const variables = {};
        interaction.fields.fields.forEach(function (field) {
          const key = field.customId.replace('var_', '');
          variables[key] = field.value;
        });
        session.data.variables = variables;
        session.step = 'details';
        return this.showDetailsModal(interaction, session);
      }
      if (interaction.customId === 'petro:details_modal') {
        if (!session || session.userId !== interaction.user.id) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Session Expired', 'Start over with .petro create.')], ephemeral: true });
        }
        const fields = {};
        interaction.fields.fields.forEach(function (field) {
          fields[field.customId] = field.value;
        });
        let ownerId = fields.server_owner.replace(/[<@!>]/g, '').trim();
        if (!/^\d{17,19}$/.test(ownerId)) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Owner', 'Owner must be a valid Discord user ID or mention.')], ephemeral: true });
        }
        const locationId = fields.server_location.trim();
        const locations = session.locations || [];
        const location = locations.find(function (l) { return String(l.attributes.id) === locationId; });
        if (!location) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Location', 'Location ID not found. Use .petro locations to see valid IDs.')], ephemeral: true });
        }
        const memory = parseInt(fields.server_memory, 10);
        const cpu = parseInt(fields.server_cpu, 10);
        const disk = parseInt(fields.server_disk || '0', 10);
        if (!memory || memory < 1) return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Memory', 'Memory must be a positive number.')], ephemeral: true });
        if (!cpu || cpu < 1) return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Invalid CPU', 'CPU must be a positive number.')], ephemeral: true });
        session.data.serverName = fields.server_name.trim();
        session.data.ownerId = ownerId;
        session.data.locationId = locationId;
        session.data.memory = memory;
        session.data.cpu = cpu;
        session.data.disk = disk;
        session.step = 'confirm';
        return this.showConfirmation(interaction, session);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'petro:confirm_create') {
        if (!session || session.userId !== interaction.user.id) {
          return interaction.reply({ embeds: [ZyronEmbedBuilder.error('Session Expired', 'Start over with .petro create.')], ephemeral: true });
        }
        interaction.deferUpdate();
        const payload = {
          name: session.data.serverName,
          user: session.data.ownerId,
          nest_id: parseInt(session.data.nestId, 10),
          egg_id: parseInt(session.data.eggId, 10),
          docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
          startup: session.data.variables.STARTUP || '',
          limits: {
            memory: session.data.memory,
            swap: 0,
            disk: session.data.disk,
            io: 500,
            cpu: session.data.cpu
          },
          feature_limits: {
            databases: 5,
            allocations: 1,
            backups: 3
          },
          allocation: {
            default: parseInt(session.data.locationId, 10)
          },
          deploy: {
            locations: [parseInt(session.data.locationId, 10)],
            dedicated_ip: false,
            port_range: []
          },
          environment: session.data.variables
        };
        return createServer(session.guildId, payload).then(function (result) {
          const server = result.data.attributes;
          activeCreateSessions.delete(sessionId);
          const successEmbed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Server Created Successfully')
            .addFields(
              { name: 'Name', value: server.name, inline: true },
              { name: 'UUID', value: server.uuid, inline: true },
              { name: 'Identifier', value: server.identifier, inline: true },
              { name: 'Node', value: String(server.node), inline: true },
              { name: 'Limits', value: server.limits.memory + 'MB RAM · ' + server.limits.cpu + '% CPU · ' + server.limits.disk + 'MB Disk', inline: true },
              { name: 'Egg', value: server.egg || 'Unknown', inline: true }
            )
            .setFooter({ text: 'Zyron • Powered by Zyra Nodes Limited' })
            .setTimestamp();
          return interaction.editReply({ embeds: [successEmbed], components: [] });
        }).catch(function (err) {
          return interaction.editReply({ embeds: [ZyronEmbedBuilder.error('Creation Failed', err.message)], components: [] });
        });
      }
      if (interaction.customId === 'petro:cancel_create') {
        if (session && session.userId === interaction.user.id) {
          activeCreateSessions.delete(sessionId);
        }
        return interaction.update({ embeds: [ZyronEmbedBuilder.info('Cancelled', 'Server creation cancelled.')], components: [] });
      }
    }
  }
};