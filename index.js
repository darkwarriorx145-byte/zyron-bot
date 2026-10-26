// Zyron Bot + Dashboard Launcher
// Starts both the Discord bot and the web dashboard in one process.
// Set DASHBOARD_PORT=3000 (default) for the dashboard.

const { spawn } = require('child_process');
const path = require('path');

const BOT_DIR = path.join(__dirname, 'bot');
const DASH_DIR = path.join(__dirname, 'dashboard');

console.log('===========================================');
console.log('  Zyron Bot + Dashboard Launcher');
console.log('  Powered by Zyra Nodes Limited');
console.log('===========================================');

let dash = null;

// Start the Discord bot
const bot = spawn('node', ['index.js'], {
  cwd: BOT_DIR,
  stdio: 'inherit',
  env: Object.assign({}, process.env)
});

bot.on('spawn', function () {
  console.log('[Launcher] Discord bot process started (pid ' + bot.pid + ')');
});

bot.on('exit', function (code) {
  console.log('[Launcher] Bot exited with code ' + code);
  if (dash) dash.kill();
  process.exit(code);
});

// Start the dashboard after a short delay
setTimeout(function () {
  dash = spawn('node', ['index.js'], {
    cwd: DASH_DIR,
    stdio: 'inherit',
    env: Object.assign({}, process.env)
  });

  dash.on('spawn', function () {
    console.log('[Launcher] Dashboard process started (pid ' + dash.pid + ')');
  });

  dash.on('exit', function (code) {
    console.log('[Launcher] Dashboard exited with code ' + code);
  });
}, 2000);

function shutdown() {
  console.log('[Launcher] Shutting down...');
  bot.kill();
  if (dash) dash.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);