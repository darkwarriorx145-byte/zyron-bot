# Zyron Bot API CLI

Two small clients for the bot's HTTP API:

- `zyron-api.sh` — bash + curl (Termux, Linux, macOS)
- `zyron-api.ps1` — Windows PowerShell

They call the API exposed by `bot/src/api/webBridge.js`.

## 1. Start the bot API

In `bot/.env`:

```env
BOT_API_ENABLED=true
BOT_API_HOST=0.0.0.0
BOT_API_PORT=4000
BOT_API_KEY=make-a-long-random-secret
BOT_API_PUBLIC_URL=https://your-ngrok-url.ngrok-free.app
DASHBOARD_URL=https://zyron-manage.netlify.app
DASHBOARD_ORIGIN=https://zyron-manage.netlify.app,http://localhost:3000
```

Start the bot, then expose port `4000`:

```bash
ngrok http 4000
```

Copy the `https://...ngrok-free.app` URL.

## 2. Configure the client

### Termux / Linux / macOS

```bash
export ZYRON_API_URL="https://your-ngrok-url.ngrok-free.app"
export ZYRON_API_KEY="your-bot-api-key"
chmod +x scripts/zyron-api.sh
./scripts/zyron-api.sh doctor
```

Or save the values in `~/.zyron-api.env`:

```bash
ZYRON_API_URL='https://your-ngrok-url.ngrok-free.app'
ZYRON_API_KEY='your-bot-api-key'
```

```bash
chmod 600 ~/.zyron-api.env
```

### Windows PowerShell

```powershell
$env:ZYRON_API_URL = "https://your-ngrok-url.ngrok-free.app"
$env:ZYRON_API_KEY = "your-bot-api-key"
.\scripts\zyron-api.ps1 doctor
```

To persist for the current Windows user:

```powershell
setx ZYRON_API_URL "https://your-ngrok-url.ngrok-free.app"
setx ZYRON_API_KEY "your-bot-api-key"
```

Open a new terminal after `setx`.

## 3. Commands

```bash
./scripts/zyron-api.sh health
./scripts/zyron-api.sh guilds
./scripts/zyron-api.sh settings 123456789012345678
./scripts/zyron-api.sh set 123456789012345678 prefix=! antiNukeEnabled=true
./scripts/zyron-api.sh set 123456789012345678 features.antiSpam=false
./scripts/zyron-api.sh set 123456789012345678 economyDaily=250
./scripts/zyron-api.sh set-json 123456789012345678 '{"punishment":"kick"}'
./scripts/zyron-api.sh raw GET /api/meta
./scripts/zyron-api.sh watch 10
```

PowerShell:

```powershell
.\scripts\zyron-api.ps1 health
.\scripts\zyron-api.ps1 guilds
.\scripts\zyron-api.ps1 set 123456789012345678 prefix=! antiNukeEnabled=true
```

## 3.1. Zyron theme emojis

Generate the red circular PNG icons:

```powershell
.\scripts\generate-emojis.ps1
```

Upload them to the Discord application (after putting the **new** token in `bot/.env`):

```powershell
node scripts\upload-emojis.js
```

This writes `bot/data/emojis.json`. Restart the bot to load them.

The generator creates 69 icons. If you change an existing PNG and need Discord to show the new image, force a re-upload:

```powershell
node scripts\upload-emojis.js --force
```

The theme is applied globally to embeds, buttons and select menus, so new UI components automatically inherit the red-circle icons.

Preview the theme in Discord:

```text
.theme
```

If the custom emojis are not uploaded yet, the bot falls back to stylish Unicode symbols instead of standard emojis.

## 4. Run bot and dashboard in the background on Windows

```powershell
cd "C:\Users\susha\OneDrive\Sushant - Personal\Documents\Default Project\Zyron-Bot\scripts"
.\start-zyron.ps1
.\status-zyron.ps1
```

Start the bot only, when the website is on Netlify:

```powershell
.\start-zyron.ps1 -NoDashboard
```

Start the bot, dashboard, and ngrok:

```powershell
.\start-zyron.ps1 -WithNgrok
```

Stop everything:

```powershell
.\stop-zyron.ps1
```

Start automatically when this Windows user logs in:

```powershell
.\install-startup.ps1
```

Logs are written to `Zyron-Bot\logs`.

If PowerShell blocks the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\start-zyron.ps1"
```

`Start-Job` is not suitable for this because it stops when the PowerShell window closes. These scripts use `Start-Process`, which detaches the bot and dashboard from the PowerShell window.

## 5. Raw curl examples

```bash
curl -s "https://your-ngrok-url.ngrok-free.app/api/health" \
  -H "Authorization: Bearer $BOT_API_KEY" \
  -H "ngrok-skip-browser-warning: true" | jq
```

```bash
curl -s -X PATCH "https://your-ngrok-url.ngrok-free.app/api/guilds/123456789012345678/settings" \
  -H "Authorization: Bearer $BOT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "ngrok-skip-browser-warning: true" \
  -d '{"prefix":"!","antiNukeEnabled":true}' | jq
```

## Current API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/ping` | No | Public ping |
| GET | `/api/health` | Yes | Bot/API status |
| POST | `/api/heartbeat` | Yes | Dashboard heartbeat |
| GET | `/api/guilds` | Yes | Guild list and settings |
| GET | `/api/meta` | Yes | Co-owners and version |
| GET | `/api/guilds/:id/settings` | Yes | One guild's settings |
| PATCH | `/api/guilds/:id/settings` | Yes | Update guild settings |

The API is protected by `BOT_API_KEY`. Never put the key in a public repo or screenshot.

## Notes

- ngrok free URLs change when ngrok restarts. Update `ZYRON_API_URL` and the Netlify `BOT_API_URL` variable.
- ngrok free shows a browser warning page for normal browser requests. The `ngrok-skip-browser-warning: true` header avoids it for API calls.
- The bot's Discord connection does **not** go through ngrok. Only the dashboard/API traffic does.
- Install `jq` for readable output: `pkg install jq` on Termux, `winget install jqlang.jq` on Windows.
