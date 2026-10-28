const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', 'bot', '.env');
const env = {};

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
}

const token = process.env.DISCORD_TOKEN || env.DISCORD_TOKEN || '';
const appId = process.env.CLIENT_ID || env.CLIENT_ID || '';
const force = process.argv.indexOf('--force') !== -1;
const iconDir = path.join(__dirname, '..', 'bot', 'assets', 'emojis');
const outFile = path.join(__dirname, '..', 'bot', 'data', 'emojis.json');

const keyMap = {
  zyron_user: 'user',
  zyron_mention: 'mention',
  zyron_id: 'id',
  zyron_added_by: 'added_by',
  zyron_expiry: 'expiry',
  zyron_timestamp: 'timestamp',
  zyron_shield: 'shield',
  zyron_success: 'success',
  zyron_error: 'error',
  zyron_warning: 'warning',
  zyron_info: 'info',
  zyron_spark: 'spark'
};

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function request(method, endpoint, body) {
  const options = {
    method: method,
    headers: {
      Authorization: 'Bot ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://github.com/darkwarriorx145-byte/zyron-bot, 1.0.0)'
    }
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch('https://discord.com/api/v10' + endpoint, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }

  if (response.status === 429) {
    const wait = data && data.retry_after ? data.retry_after : 2;
    console.log('Rate limited. Waiting ' + wait + 's...');
    await sleep(wait * 1000);
    return request(method, endpoint, body);
  }

  if (!response.ok) {
    throw new Error(method + ' ' + endpoint + ' -> ' + response.status + ' ' + text);
  }

  return data;
}

async function main() {
  if (!token) throw new Error('DISCORD_TOKEN is missing in bot/.env');
  if (!appId) throw new Error('CLIENT_ID is missing in bot/.env');
  if (!fs.existsSync(iconDir)) throw new Error('Emoji folder not found: ' + iconDir);

  const existing = await request('GET', '/applications/' + appId + '/emojis');
  const list = Array.isArray(existing) ? existing : (existing.items || []);
  const byName = {};

  list.forEach(function (emoji) {
    byName[emoji.name] = emoji;
  });

  const files = fs.readdirSync(iconDir)
    .filter(function (file) { return file.toLowerCase().endsWith('.png'); })
    .sort();

  if (!files.length) throw new Error('No PNG files found in ' + iconDir);

  const map = {};

  for (const file of files) {
    const name = path.basename(file, '.png');
    const key = keyMap[name] || name.replace(/^zyron_/, '');
    let emoji = byName[name];

    if (emoji && force) {
      await request('DELETE', '/applications/' + appId + '/emojis/' + emoji.id);
      console.log('Deleted ' + name + ' -> ' + emoji.id);
      emoji = null;
    }

    if (!emoji) {
      const image = 'data:image/png;base64,' +
        fs.readFileSync(path.join(iconDir, file)).toString('base64');

      emoji = await request('POST', '/applications/' + appId + '/emojis', {
        name: name,
        image: image
      });

      console.log('Uploaded ' + name + ' -> ' + emoji.id);
    } else {
      console.log('Exists ' + name + ' -> ' + emoji.id);
    }

    map[key] = '<:' + emoji.name + ':' + emoji.id + '>';
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n');

  console.log('');
  console.log('Wrote ' + outFile);
  console.log('Restart the bot to load the custom emojis.');
}

main().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
