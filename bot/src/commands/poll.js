const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../../config.json');

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  name: 'poll',
  aliases: ['vote'],
  description: 'Creates a reaction poll. Separate the question and options with |.',
  permissions: [PermissionsBitField.Flags.ManageMessages],
  usage: '<question> | <option1> | <option2> ...',
  subcommands: [
    { name: '<question>', description: 'Simple yes/no poll with 👍 and 👎 reactions.' },
    { name: '<question> | <option1> | <option2>', description: 'Multi option poll with up to 10 options.' }
  ],
  async execute(client, message, args) {
    const input = args.join(' ').trim();

    if (!input) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.danger)
            .setTitle('❌ Missing Question')
            .setDescription('Example: **.poll Favourite game? | Minecraft | Valorant | GTA**')
        ]
      });
    }

    const parts = input.split('|').map(function (part) {
      return part.trim();
    }).filter(function (part) {
      return part.length > 0;
    });

    const question = parts.shift();
    const options = parts.slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setAuthor({
        name: message.author.tag + ' started a poll',
        iconURL: message.author.displayAvatarURL()
      })
      .setTitle('📊 ' + question)
      .setFooter({ text: config.botName + ' • Powered by ' + config.company })
      .setTimestamp();

    if (options.length === 0) {
      embed.setDescription('React with 👍 for **Yes** or 👎 for **No**.');
    } else {
      const lines = options.map(function (option, index) {
        return NUMBERS[index] + ' ' + option;
      });
      embed.setDescription(lines.join('\n') + '\n\nReact with the matching number to vote.');
    }

    const sent = await message.channel.send({ embeds: [embed] });

    if (options.length === 0) {
      await sent.react('👍').catch(function () {});
      await sent.react('👎').catch(function () {});
    } else {
      for (let i = 0; i < options.length; i++) {
        await sent.react(NUMBERS[i]).catch(function () {});
      }
    }

    if (message.deletable) message.delete().catch(function () {});
  }
};
