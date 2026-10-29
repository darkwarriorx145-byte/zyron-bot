const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const config = require('../../config.json');

function ensureVouchData(guildId) {
  if (!db.data.vouches) db.data.vouches = {};
  if (!Array.isArray(db.data.vouches[guildId])) db.data.vouches[guildId] = [];
}

function addVouch(guildId, data) {
  ensureVouchData(guildId);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    giverId: data.giverId,
    receiverId: data.receiverId,
    reason: data.reason,
    stars: Math.max(1, Math.min(5, parseInt(data.stars, 10))),
    anonymous: data.anonymous || false,
    messageId: data.messageId || null,
    createdAt: Date.now()
  };
  db.data.vouches[guildId].push(entry);
  db.save();
  return entry;
}

function getVouches(guildId, userId = null) {
  ensureVouchData(guildId);
  const list = db.data.vouches[guildId] || [];
  if (userId) return list.filter(v => v.receiverId === userId);
  return list;
}

function getVouchStats(guildId, userId) {
  const vouches = getVouches(guildId, userId);
  if (vouches.length === 0) return { count: 0, averageStars: 0, totalStars: 0 };
  const totalStars = vouches.reduce((sum, v) => sum + v.stars, 0);
  return {
    count: vouches.length,
    averageStars: Math.round((totalStars / vouches.length) * 10) / 10,
    totalStars,
    distribution: [1,2,3,4,5].map(s => ({ stars: s, count: vouches.filter(v => v.stars === s).length }))
  };
}

function getVouchLeaderboard(guildId, limit = 10) {
  const all = getVouches(guildId);
  const stats = {};
  all.forEach(v => {
    if (!stats[v.receiverId]) stats[v.receiverId] = { count: 0, totalStars: 0 };
    stats[v.receiverId].count++;
    stats[v.receiverId].totalStars += v.stars;
  });
  return Object.entries(stats)
    .map(([userId, data]) => ({ userId, ...data, avg: Math.round((data.totalStars / data.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, limit);
}

async function openVouchModal(interaction, targetUser) {
  if (targetUser.id === interaction.user.id) {
    return interaction.reply({ content: 'You cannot vouch for yourself.', ephemeral: true });
  }
  if (targetUser.bot) {
    return interaction.reply({ content: 'You cannot vouch for bots.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('vouch:submit:' + targetUser.id)
    .setTitle('Vouch for ' + targetUser.username);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('What are you vouching for?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g., "Great middleman, fast and trustworthy"')
        .setMaxLength(500)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('stars')
        .setLabel('Rating (1-5 stars)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('5')
        .setMaxLength(1)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anonymous')
        .setLabel('Anonymous? (yes/no)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('no')
        .setMaxLength(3)
        .setRequired(false)
    )
  );

  return interaction.showModal(modal);
}

async function handleVouchSubmit(interaction) {
  const targetId = interaction.customId.split(':')[2];
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });

  let stars = parseInt(interaction.fields.getTextInputValue('stars') || '0', 10);
  if (isNaN(stars) || stars < 1 || stars > 5) {
    return interaction.reply({ content: 'Rating must be 1-5.', ephemeral: true });
  }

  const reason = String(interaction.fields.getTextInputValue('reason') || '').trim().slice(0, 500);
  if (!reason) {
    return interaction.reply({ content: 'Reason is required.', ephemeral: true });
  }

  const anonymous = (interaction.fields.getTextInputValue('anonymous') || '').trim().toLowerCase() === 'yes';

  const vouch = addVouch(interaction.guild.id, {
    giverId: interaction.user.id,
    receiverId: targetId,
    reason,
    stars,
    anonymous
  });

  const stats = getVouchStats(interaction.guild.id, targetId);
  const starsDisplay = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);

  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('✅ Vouch Submitted')
    .setDescription('Your vouch for ' + target + ' has been recorded.')
    .addFields(
      { name: 'Rating', value: starsDisplay + ' (' + stars + '/5)', inline: true },
      { name: 'Total Vouches', value: String(stats.count), inline: true },
      { name: 'Average', value: String(stats.averageStars) + '/5', inline: true }
    )
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();

  const logId = db.getGuild(interaction.guild.id).vouchLogChannel;
  const logChannel = logId ? interaction.guild.channels.cache.get(logId) : null;
  if (logChannel) {
    const publicEmbed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🤝 New Vouch')
      .setDescription(
        (anonymous ? '👤 **Anonymous**' : '**' + interaction.user.tag + ' (<@' + interaction.user.id + '>)') + ' vouched for ' + target +
        '\n\n**Rating:** ' + starsDisplay + ' (' + stars + '/5)\n' +
        '**Reason:** ' + reason
      )
      .setFooter({ text: 'Total: ' + stats.count + ' | Avg: ' + stats.averageStars + '/5' })
      .setTimestamp();
    await logChannel.send({ embeds: [publicEmbed] }).catch(() => {});
  }

  await target.send({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('🤝 You Received a Vouch!')
      .setDescription('**From:** ' + (anonymous ? '👤 Anonymous' : interaction.user.tag) + '\n' +
        '**Rating:** ' + starsDisplay + ' (' + stars + '/5)\n' +
        '**Reason:** ' + reason + '\n\n' +
        'Your total vouches: **' + stats.count + '** (Avg: ' + stats.averageStars + '/5)')
      .setFooter({ text: config.botName + ' | Powered by ' + config.company })
      .setTimestamp()
    ]
  }).catch(() => {});

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

function buildVouchEmbed(user, guild) {
  const stats = getVouchStats(guild.id, user.id);
  const vouches = getVouches(guild.id, user);
  const starsDisplay = '⭐'.repeat(Math.floor(stats.averageStars)) + '☆'.repeat(5 - Math.floor(stats.averageStars));
  
  const recent = vouches.slice(-3).map(v => 
    (v.anonymous ? '👤 Anonymous' : '<@' + v.giverId + '>') + 
    ' — ' + '⭐'.repeat(v.stars) + ' — ' + v.reason.slice(0, 80)
  ).join('\n') || 'No recent vouches.';

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🤝 Vouch Profile — ' + user.tag)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Total Vouches', value: String(stats.count), inline: true },
      { name: 'Average Rating', value: stats.averageStars + '/5 ' + starsDisplay, inline: true },
      { name: 'Total Stars', value: String(stats.totalStars), inline: true },
      { name: 'Recent Vouches', value: recent, inline: false }
    )
    .setFooter({ text: config.botName + ' | Powered by ' + config.company })
    .setTimestamp();
}

module.exports = {
  addVouch,
  getVouches,
  getVouchStats,
  getVouchLeaderboard,
  openVouchModal,
  handleVouchSubmit,
  buildVouchEmbed,
  ensureVouchData
};