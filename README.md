# Zyron Bot + Dashboard

Discord moderation, anti-nuke, anti-raid, AutoMod, economy, AI security and a web dashboard.
Every feature is free. There is no premium tier.
Powered by Zyra Nodes Limited.

## Structure

- `bot/` - the Discord bot. Run `node index.js` inside this folder.
- `bot/src/api/webBridge.js` - the key-protected HTTP API the website uses when the bot is on another machine.
- `dashboard/` - the web dashboard. Run `node index.js` inside this folder.
- `dashboard/netlify/functions/server.js` - Netlify Function wrapper for the dashboard.
- `index.js` - optional launcher that starts both processes for local use.

Each folder has its own `package.json`, `.env.example` and `node_modules`.

## Packages

- `Zyron-Bot.zip` - Pterodactyl bot with `node_modules`. Recommended for the bot server.
- `Zyron-Bot-Source.zip` - bot source without `node_modules`. Run `npm install` first.
- `Zyron-Dashboard.zip` - local dashboard with `node_modules`.
- `Zyron-Dashboard-Source.zip` - dashboard source for GitHub/Netlify. Netlify installs the dependencies.
- `Zyron-Complete.zip` - all-in-one bot + dashboard with `node_modules`, for local use.
- `Zyron-Complete-Source.zip` - all-in-one source without `node_modules`.

## Setup

1. Copy `bot/.env.example` to `bot/.env`.
2. Set `DISCORD_TOKEN`, `CLIENT_ID` and `DEFAULT_OWNER_ID` in `bot/.env`.
3. Add your `OPENROUTER_API_KEY` if you want the AI second opinion.
4. Copy `dashboard/.env.example` to `dashboard/.env`.
5. Set the Discord OAuth client ID, client secret and redirect URI in `dashboard/.env`.
6. Register both `http://localhost:3000/auth/discord/callback` and `http://127.0.0.1:3000/auth/discord/callback` in the Discord Developer Portal. Open `/auth/debug` on the dashboard to see the exact callback URL for the host you use.
7. Start the bot with `node bot/index.js` and the dashboard with `node dashboard/index.js`.
8. Or start both with `node index.js` from this folder.

For Pterodactyl + Netlify, see the deployment section below. Set `BOT_API_URL` and `BOT_API_KEY` on the website and the matching `BOT_API_KEY` on the bot. Run `.webtest` in Discord to verify the link.

## Bot Commands

- `.antinuke` - Anti-Nuke settings and whitelist
- `.featurewl` - per-feature whitelist dropdown
- `.automod` - AutoMod, filters, raid and lockdown
- `.ai` - AI status, model, threshold, message scan and test
- `.economy` - daily rewards, invite coins, transfers, leaderboard and per-server reward settings
- `.lockdown` / `.unlockdown` - emergency lockdown and restore
- `.ticket`, `.poll`, `.giveaway`, `.staffapply`
- `.ban`, `.kick`, `.warn`, `.timeout`, `.purge`
- `.autorole`, `.invites`, `.profile`, `.owner`

## Dashboard

- Discord OAuth only. There is no email or password login.
- The server picker shows only servers where you are owner, have Manage Server, or have Administrator.
- "Configure" opens the settings for a server where Zyron is installed.
- "Add Bot to Server" opens the correct invite when Zyron is missing.
- The main admin panel is unlocked by `MAIN_ADMIN_DISCORD_ID` in `dashboard/.env`.
- Every server has completely separate settings in the bot database.
- Dashboard settings apply live: the bot merges dashboard-managed settings on the next event and preserves warnings, invites, coins, and other runtime data.
- AI Guard settings, model, confidence threshold and a live test button are built in.
- Remote bot bridge for Pterodactyl + Netlify. The website talks to the running bot over a key-protected HTTPS API instead of a shared file.
- Link Test page and `/api/link-test` endpoint show whether the website can reach the bot.
- Netlify Function wrapper included. The dashboard can run on Netlify without a separate Node host.

## Pterodactyl + Netlify

The bot runs on Pterodactyl. The website runs on Netlify. They are separate machines, so the website cannot read the bot's `database.json`. The bot API bridges them.

### 1. Bot on Pterodactyl

Add these to the bot environment variables:

    BOT_API_ENABLED=true
    BOT_API_HOST=0.0.0.0
    BOT_API_PORT=4000
    BOT_API_KEY=make-a-long-random-secret
    BOT_API_PUBLIC_URL=https://your-bot-api-domain
    DASHBOARD_URL=https://your-site.netlify.app
    DASHBOARD_ORIGIN=https://your-site.netlify.app,http://localhost:3000

Allocate port 4000 in the panel's Network tab. If the panel gives you a different port, set `BOT_API_PORT` to that port. Use the public HTTPS URL of the allocation as `BOT_API_PUBLIC_URL`. If the allocation is plain HTTP, put it behind Cloudflare Tunnel, a reverse proxy, or the panel's SSL domain. Do not send the API key over plain HTTP on the public internet.

### 2. Website on Netlify

1. Push the project to GitHub, or use the Netlify CLI from `dashboard/`.
2. Create a Netlify site from the repository.
3. Set the base directory to `dashboard` when the repository root is `Zyron-Bot`. If you deploy the dashboard-only package (`Zyron-Dashboard-Source.zip`) with its files at the repository root, leave the base directory empty.
4. Build command: empty. Publish directory: `public`. Functions directory: `netlify/functions`.
5. Add the environment variables from `dashboard/.env.example` in Netlify. At minimum: `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `MAIN_ADMIN_DISCORD_ID`, `BOT_TOKEN`, `BOT_API_URL`, `BOT_API_KEY`, `DASHBOARD_PUBLIC_URL`, `DASHBOARD_SECURE_COOKIES=true`.
6. Add `https://your-site.netlify.app/auth/discord/callback` to Discord OAuth2 -> General -> Redirects.
7. Deploy, open `/auth/debug`, and confirm the callback URL.
8. Open `/link-test` and confirm the bot is reachable.
9. Run `.webtest` in Discord. It shows the API status, the last dashboard heartbeat, and the exact dashboard environment values.

### 3. Localhost first

You can test the website locally before Netlify:

1. Start the bot on Pterodactyl (or locally).
2. Set `BOT_API_URL` and `BOT_API_KEY` in `dashboard/.env`.
3. Run `npm start` inside `dashboard/`.
4. Open `http://localhost:3000/link-test`.
5. Sign in with Discord and save a setting. The bot applies it on the next event without a restart.

If you run both the bot and website on the same PC and want the old shared-file mode, leave `BOT_API_URL` and `BOT_API_KEY` empty. The dashboard will read and write `database.json` directly.

If the bot API is offline, the dashboard still uses `BOT_TOKEN` to read the bot's Discord guild list and falls back to the local bot database. A server where Zyron is installed is not shown as "not invited". The page shows an offline banner, and saving settings requires the bot API to be reachable.

## AI Security

The AI is a second opinion, not the only line of defense.

- Anti-nuke mass actions still trigger instantly.
- Young-account raids still trigger instantly.
- Ambiguous events get a short AI confirmation window, then deterministic rules apply.
- Messages can never be banned by the AI. The strongest message action is a 10-minute timeout.
- If the OpenRouter key has no credits or the free daily quota is used up, Zyron falls back to its normal rules.

Default model chain:

1. `openrouter/auto` (needs credits)
2. `poolside/laguna-s-2.1:free`
3. `openrouter/free`

## Features

- 24 Anti-Nuke protections
- Per-feature whitelist with a dropdown UI
- Anti-Betrayal detection for trusted users who go rogue
- Anti-Raid with kick or ban
- Auto Lockdown when a punishment fails
- Native Discord AutoMod integration
- Anti-Abuse filters for English and Hindi
- AI confirmation for nukes, raids and abusive messages
- Economy: daily rewards, invite coins, transfers, leaderboard and admin-configurable per-server rewards
- Web dashboard with per-server settings and a main admin panel

## Security

- Never commit or share `.env` files.
- Rotate any token, client secret or API key that was pasted into chat.
- Use HTTPS and set `DASHBOARD_SECURE_COOKIES=true` in production.
- Keep the dashboard behind a strong `SESSION_SECRET`.
- Use a long random `BOT_API_KEY` and keep it only in the bot and website environment variables.
- Never expose `BOT_API_KEY` in browser code. The dashboard sends it server-side.
- The bot API should be reachable over HTTPS only.
- The bot needs Administrator or the documented moderation permissions.
- Every manual punishment requires a reason. Automatic punishments always include one.
