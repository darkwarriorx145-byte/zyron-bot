const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');
const db = require('../../src/database/db');
const shop = require('../utils/shop');
const ZyronEmbedBuilder = require('../utils/embedBuilder');

function roleFromArg(message, raw) {
  if (!raw) return null;
  const id = raw.replace(/[<@&>]/g, '');
  return message.guild.roles.cache.get(id) || null;
}

function itemLine(item) {
  const stock = item.stock === -1 ? '∞' : String(item.stock);
  return item.emoji + ' **' + item.name + '** — **' + item.price + '** coins\n' +
    '`' + item.id + '` • Stock: ' + stock + ' • Sold: ' + (item.sold || 0) +
    (item.description ? '\n' + item.description : '');
}

module.exports = {
  name: 'shop',
  aliases: ['store', 'buy'],
  description: 'Community coin shop with role rewards set by server admins.',
  usage: '<list|buy|info|history|add|edit|remove|settings>',
  subcommands: [
    { name: 'list', description: 'Show every item in the shop.' },
    { name: 'buy <item id>', description: 'Buy an item with your coins.' },
    { name: 'info <item id>', description: 'Show details for one item.' },
    { name: 'history [@user]', description: 'Show your recent purchases.' },
    { name: 'add <name> <price> <@role>', description: 'Add a shop item (Manage Server).', admin: true },
    { name: 'edit <item id> <field> <value>', description: 'Edit a shop item (Manage Server).', admin: true },
    { name: 'remove <item id>', description: 'Remove a shop item (Manage Server).', admin: true },
    { name: 'settings', description: 'View shop settings (Manage Server).', admin: true }
  ],

  async execute(client, message, args) {
    const sub = (args[0] || 'list').toLowerCase();
    const settings = db.getGuild(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    const canManage = message.member && message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (sub === 'help') {
      return message.reply({ embeds: [ZyronEmbedBuilder.info('Coin Shop', 'Use ' + prefix + 'shop list to browse. Buy with ' + prefix + 'shop buy <item id>.')] });
    }

    if (sub === 'list' || sub === 'items') {
      const items = shop.getItems(message.guild.id).filter(function (item) { return item.enabled; });
      if (!settings.shopEnabled) {
        return message.reply({ embeds: [ZyronEmbedBuilder.warning('Shop Closed', 'The coin shop is currently disabled.')] });
      }
      if (items.length === 0) {
        return message.reply({ embeds: [ZyronEmbedBuilder.info('Shop Empty', 'No items are available yet.')] });
      }
      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🛒 ' + message.guild.name + ' Coin Shop')
          .setDescription(items.map(itemLine).join('\n\n'))
          .setFooter({ text: 'Balance: ' + db.getCoins(message.guild.id, message.author.id) + ' coins • Buy with ' + prefix + 'shop buy <id>' })
          .setTimestamp()]
      });
    }

    if (sub === 'buy' || sub === 'purchase') {
      const itemId = (args[1] || '').trim();
      if (!itemId) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Missing Item', 'Use ' + prefix + 'shop buy <item id>.')] });
      }
      try {
        const result = await shop.purchase(message.guild, message.member, itemId, settings);
        return message.reply({
          embeds: [ZyronEmbedBuilder.success('Purchase Complete', 'You bought **' + result.item.name + '** for **' + result.item.price + '** coins.\n**New balance:** ' + result.balance + ' coins.')]
        });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Purchase Failed', err.message)] });
      }
    }

    if (sub === 'info') {
      const item = shop.getItem(message.guild.id, args[1]);
      if (!item) return message.reply({ embeds: [ZyronEmbedBuilder.error('Item Not Found', 'Check the item ID with ' + prefix + 'shop list.')] });
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(item.emoji + ' ' + item.name)
          .setDescription(item.description || 'No description.')
          .addFields(
            { name: 'Price', value: String(item.price) + ' coins', inline: true },
            { name: 'Stock', value: item.stock === -1 ? 'Unlimited' : String(item.stock), inline: true },
            { name: 'Role', value: item.roleId ? '<@&' + item.roleId + '>' : 'None', inline: true }
          )
          .setFooter({ text: 'Item ID: ' + item.id + ' • Buy with ' + prefix + 'shop buy ' + item.id })
          .setTimestamp()]
      });
    }

    if (sub === 'history' || sub === 'orders') {
      const target = message.mentions.users.first() || message.author;
      const purchases = shop.purchasesForUser(message.guild.id, target.id).slice(0, 10);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🧾 Purchases — ' + target.username)
          .setDescription(purchases.length > 0
            ? purchases.map(function (purchase) {
                return '• **' + purchase.itemName + '** — ' + purchase.price + ' coins — <t:' + Math.floor(purchase.createdAt / 1000) + ':R>';
              }).join('\n')
            : 'No purchases yet.')
          .setTimestamp()]
      });
    }

    if (sub === 'settings') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to view shop settings.')] });
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('🛒 Shop Settings')
          .setDescription(
            '**Status:** ' + (settings.shopEnabled ? 'Enabled' : 'Disabled') + '\n' +
            '**Items:** ' + shop.getItems(message.guild.id).length + '\n' +
            '**Log channel:** ' + (settings.shopLogChannel ? '<#' + settings.shopLogChannel + '>' : '*not set*')
          )
          .setFooter({ text: 'Configure items from the dashboard or with ' + prefix + 'shop add.' })
          .setTimestamp()]
      });
    }

    if (sub === 'add') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to add shop items.')] });
      const name = args[1];
      const price = parseInt(args[2], 10);
      const role = roleFromArg(message, args[3]);
      if (!name || isNaN(price) || price < 1 || !role) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Usage', 'Use ' + prefix + 'shop add <name> <price> <@role> [description].')] });
      }
      try {
        const item = shop.addItem(message.guild.id, {
          name: name,
          price: price,
          roleId: role.id,
          description: args.slice(4).join(' ').trim()
        });
        return message.reply({ embeds: [ZyronEmbedBuilder.success('Shop Item Added', item.emoji + ' **' + item.name + '** for **' + item.price + '** coins.\nID: `' + item.id + '`')] });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Could Not Add Item', err.message)] });
      }
    }

    if (sub === 'edit') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to edit shop items.')] });
      const itemId = args[1];
      const field = (args[2] || '').toLowerCase();
      const value = args.slice(3).join(' ').trim();
      if (!itemId || !field || !value) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Usage', 'Use ' + prefix + 'shop edit <id> <name|price|stock|description|role> <value>.')] });
      }
      const updates = {};
      if (field === 'name' || field === 'description' || field === 'emoji' || field === 'message') updates[field] = value;
      if (field === 'price' || field === 'stock') updates[field] = parseInt(value, 10);
      if (field === 'role') {
        const role = roleFromArg(message, value);
        if (!role) return message.reply({ embeds: [ZyronEmbedBuilder.error('Invalid Role', 'Mention a role.')] });
        updates.roleId = role.id;
      }
      try {
        const item = shop.updateItem(message.guild.id, itemId, updates);
        return message.reply({ embeds: [ZyronEmbedBuilder.success('Shop Item Updated', '**' + item.name + '** has been updated.')] });
      } catch (err) {
        return message.reply({ embeds: [ZyronEmbedBuilder.error('Could Not Update Item', err.message)] });
      }
    }

    if (sub === 'remove' || sub === 'delete') {
      if (!canManage) return message.reply({ embeds: [ZyronEmbedBuilder.error('Manage Server Required', 'You need **Manage Server** to remove shop items.')] });
      const removed = shop.deleteItem(message.guild.id, args[1]);
      if (!removed) return message.reply({ embeds: [ZyronEmbedBuilder.error('Item Not Found', 'Check the item ID with ' + prefix + 'shop list.')] });
      return message.reply({ embeds: [ZyronEmbedBuilder.success('Shop Item Removed', 'The item is no longer available.')] });
    }

    return message.reply({ embeds: [ZyronEmbedBuilder.error('Unknown Subcommand', 'Use ' + prefix + 'shop to see every option.')] });
  }
};
