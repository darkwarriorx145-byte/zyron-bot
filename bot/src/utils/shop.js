const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');
const progression = require('./progression');

function ensureGuild(guildId) {
  if (!db.data.shops[guildId]) db.data.shops[guildId] = [];
  if (!db.data.purchases[guildId]) db.data.purchases[guildId] = [];
  return db.data.shops[guildId];
}

function getItems(guildId) {
  return ensureGuild(guildId).slice();
}

function getItem(guildId, itemId) {
  const id = String(itemId || '').toLowerCase();
  return ensureGuild(guildId).filter(function (item) {
    return String(item.id).toLowerCase() === id;
  })[0] || null;
}

function cleanItem(payload) {
  const source = payload || {};
  const price = Math.max(0, Math.min(100000000, Number(source.price) || 0));
  const stock = source.stock === undefined || source.stock === null || source.stock === ''
    ? -1
    : Math.max(-1, Math.min(1000000, parseInt(source.stock, 10)));
  return {
    name: String(source.name || '').trim().slice(0, 80),
    description: String(source.description || '').trim().slice(0, 500),
    price: price,
    roleId: source.roleId ? String(source.roleId).trim() : null,
    emoji: String(source.emoji || '🎁').trim().slice(0, 64) || '🎁',
    stock: isNaN(stock) ? -1 : stock,
    maxPerUser: Math.max(0, Math.min(100, parseInt(source.maxPerUser, 10) || 0)),
    enabled: source.enabled === undefined ? true : Boolean(source.enabled),
    message: String(source.message || '').trim().slice(0, 500)
  };
}

function addItem(guildId, payload) {
  const items = ensureGuild(guildId);
  const clean = cleanItem(payload);
  if (!clean.name) throw new Error('An item name is required.');
  if (clean.price <= 0) throw new Error('The price must be greater than zero.');
  if (!clean.roleId) throw new Error('Choose a role for this shop item.');

  const item = Object.assign({}, clean, {
    id: crypto.randomBytes(5).toString('hex'),
    sold: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  items.push(item);
  db.save();
  return item;
}

function updateItem(guildId, itemId, payload) {
  const item = getItem(guildId, itemId);
  if (!item) throw new Error('Shop item not found.');
  const clean = cleanItem(Object.assign({}, item, payload || {}));
  if (!clean.name) throw new Error('An item name is required.');
  if (clean.price <= 0) throw new Error('The price must be greater than zero.');
  if (!clean.roleId) throw new Error('Choose a role for this shop item.');

  Object.assign(item, clean, { updatedAt: Date.now() });
  db.save();
  return item;
}

function deleteItem(guildId, itemId) {
  const items = ensureGuild(guildId);
  const index = items.findIndex(function (item) { return item.id === itemId; });
  if (index === -1) return false;
  items.splice(index, 1);
  db.save();
  return true;
}

function userPurchaseCount(guildId, userId, itemId) {
  const purchases = db.data.purchases[guildId] || [];
  return purchases.filter(function (purchase) {
    return purchase.userId === userId && purchase.itemId === itemId && purchase.status !== 'refunded';
  }).length;
}

async function purchase(guild, member, itemId, settings) {
  if (!settings.shopEnabled) throw new Error('The coin shop is currently disabled.');
  const item = getItem(guild.id, itemId);
  if (!item) throw new Error('That shop item does not exist.');
  if (!item.enabled) throw new Error('That shop item is not available right now.');

  const role = item.roleId ? guild.roles.cache.get(item.roleId) : null;
  if (!role) throw new Error('The role for this item no longer exists. Contact staff.');
  if (!role.editable) throw new Error('I cannot assign that role. Move my role above it.');

  if (member.roles.cache.has(role.id)) throw new Error('You already own **' + item.name + '**.');

  if (typeof item.stock === 'number' && item.stock === 0) {
    throw new Error('**' + item.name + '** is out of stock.');
  }

  if (item.maxPerUser > 0 && userPurchaseCount(guild.id, member.id, item.id) >= item.maxPerUser) {
    throw new Error('You reached the purchase limit for **' + item.name + '**.');
  }

  const coins = db.getCoins(guild.id, member.id);
  if (coins < item.price) {
    throw new Error('You need **' + (item.price - coins) + '** more coins to buy **' + item.name + '**.');
  }

  await member.roles.add(role, 'Purchased ' + item.name + ' from the coin shop');
  db.removeCoins(guild.id, member.id, item.price);

  item.sold = (item.sold || 0) + 1;
  if (typeof item.stock === 'number' && item.stock > 0) item.stock -= 1;

  const purchaseRecord = {
    id: crypto.randomBytes(6).toString('hex'),
    itemId: item.id,
    itemName: item.name,
    userId: member.id,
    price: item.price,
    roleId: role.id,
    createdAt: Date.now(),
    status: 'completed'
  };
  if (!db.data.purchases[guild.id]) db.data.purchases[guild.id] = [];
  db.data.purchases[guild.id].push(purchaseRecord);
  db.save();

  try {
    progression.recordActivity(guild.id, member.id, 'purchase', 1, guild.client);
  } catch (err) {
    console.error('Progression purchase activity failed:', err.message);
  }

  const logId = settings.shopLogChannel || settings.logChannel;
  const logChannel = logId ? guild.channels.cache.get(logId) : null;
  if (logChannel) {
    logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🛒 Shop Purchase')
        .setDescription('<@' + member.id + '> bought **' + item.name + '** for **' + item.price + '** coins.')
        .addFields(
          { name: 'Role', value: '<@&' + role.id + '>', inline: true },
          { name: 'Remaining balance', value: String(db.getCoins(guild.id, member.id)), inline: true }
        )
        .setFooter({ text: config.botName + ' Shop' })
        .setTimestamp()]
    }).catch(function () {});
  }

  return { item: item, purchase: purchaseRecord, role: role, balance: db.getCoins(guild.id, member.id) };
}

function purchasesForUser(guildId, userId) {
  return (db.data.purchases[guildId] || []).filter(function (purchase) {
    return purchase.userId === userId;
  }).sort(function (a, b) { return b.createdAt - a.createdAt; });
}

module.exports = {
  getItems,
  getItem,
  addItem,
  updateItem,
  deleteItem,
  purchase,
  purchasesForUser,
  userPurchaseCount
};
