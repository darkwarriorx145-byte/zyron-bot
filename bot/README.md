# Zyron Discord Bot

Moderation, Anti-Nuke, AutoMod, anti-raid and AI security bot.
Every feature is free. There is no premium tier.
Powered by Zyra Nodes Limited.

## Package

Use `Zyron-Bot.zip` for Pterodactyl. It includes `node_modules`.
Use `Zyron-Bot-Source.zip` if you prefer to run `npm install` yourself.

## Requirements

- Node.js 20 or 22 LTS (recommended)
- Discord bot token
- Message Content Intent, Server Members Intent and Presence Intent enabled in the Developer Portal
- Bot role placed above every other role
- Permissions: Administrator (or Manage Server, Manage Channels, Manage Roles, Manage Messages, Kick Members, Ban Members, Moderate Members, View Audit Log)

## Setup

1. Extract this zip directly into /home/container/
2. Copy .env.example to .env
3. Open .env and set DISCORD_TOKEN and DEFAULT_OWNER_ID
4. Start the bot with: node index.js
   (The full package includes node_modules. The Source zip needs npm install first.)
5. Invite the bot and move its role to the top of the role list.
6. Run .antinuke settings to check the protection matrix.
7. Run .automod setup to create the native Discord AutoMod rules.

## AI Security Engine

Zyron can ask OpenRouter for a second opinion before it punishes someone. The AI can clear a false positive or escalate a real nuke, raid or abuse case.

1. Create an OpenRouter key at https://openrouter.ai/keys
2. Add it to .env as OPENROUTER_API_KEY
3. Add credits, or use the free fallback models
4. Run .ai status to check the engine
5. Run .ai test <message> to classify a sample
6. Use .ai on / .ai off per server
7. Use .ai threshold 0.6 to tune confidence
8. Use .ai model openrouter/auto or a specific model

Default chain:

- openrouter/auto (needs credits)
- poolside/laguna-s-2.1:free (fallback)
- openrouter/free (last fallback)

If the key has no credits and the free daily quota is used up, the AI returns a rate-limit error. Zyron then falls back to its deterministic rules. Mass anti-nuke actions and young-account raids still trigger instantly without waiting for the AI.

Messages can never be banned by the AI. The strongest message action is a 10-minute timeout.

## Web Dashboard

The dashboard is a separate package in dashboard/. It uses Discord OAuth only.

There are two ways to connect it:

1. Local mode: the bot and dashboard run on the same PC and read the same data/database.json.
2. Remote mode: the bot runs on Pterodactyl and the website runs on Netlify. The dashboard uses the bot API instead of a shared file.

Local mode:

1. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI in dashboard/.env
2. Register the redirect URI in the Discord Developer Portal
3. Run npm install (skip it if node_modules is included) and npm start inside dashboard/
4. Open http://localhost:3000

The bot watches the database for dashboard changes. Protection, AI, economy, and logging settings saved in the dashboard apply on the next bot event without restarting. Runtime data such as warnings, invites, and coins is preserved.

The server picker only shows servers where you are owner, have Manage Server, or have Administrator. The main admin panel is unlocked by MAIN_ADMIN_DISCORD_ID.

If the bot API is offline, the dashboard uses the bot token to read the bot's Discord guild list and falls back to the local database. A server where Zyron is installed is still shown as protected, not "not invited". The page shows an offline banner, and saving settings requires the bot API.

## Web Bridge (Pterodactyl + Netlify)

The bot includes a small HTTP API for the website. It uses only Node built-ins, so it adds no dependencies.

Add these to the bot .env:

    BOT_API_ENABLED=true
    BOT_API_HOST=0.0.0.0
    BOT_API_PORT=4000
    BOT_API_KEY=make-a-long-random-secret
    BOT_API_PUBLIC_URL=https://your-bot-api-domain
    DASHBOARD_URL=https://your-site.netlify.app
    DASHBOARD_ORIGIN=https://your-site.netlify.app,http://localhost:3000

Then:

1. Allocate port 4000 in the Pterodactyl panel (Network tab). Use the allocated port as BOT_API_PORT if it is not 4000.
2. Put the public HTTPS URL of that allocation in BOT_API_PUBLIC_URL.
3. Restart the bot.
4. Run .webtest in Discord.
5. Set BOT_API_URL and BOT_API_KEY on the dashboard (same key) and open the Link Test page.

Endpoints:

    GET   /api/ping                         public health check
    GET   /api/health                       bot identity and uptime
    GET   /api/link-status                  heartbeat and API status
    GET   /api/guilds                       guilds and settings summaries
    GET   /api/guilds/:id/settings          one server's settings
    PATCH /api/guilds/:id/settings          save one server's settings
    POST  /api/heartbeat                    dashboard heartbeat
    GET   /api/meta                         co-owners and bot metadata

Every endpoint except /api/ping requires the API key.

Use HTTPS for the public API. If the Pterodactyl allocation is plain HTTP, put it behind Cloudflare Tunnel, a reverse proxy, or the panel's SSL domain. The API key must not travel over plain HTTP on the public internet.

The bot API stores nothing extra. It reads and writes the same per-server database as the bot commands.

## Pterodactyl

1. Upload the zip contents to /home/container/
2. Set the startup command to node index.js
3. Add the environment variables in the panel, or upload .env
4. Allocate the bot API port (default 4000) if the website runs on another machine
5. Do not run the dashboard on Pterodactyl when it is hosted on Netlify. Only the bot runs here.
6. Run .webtest to confirm the website link.

## Main Commands

- .antinuke settings - live protection matrix
- .antinuke whitelist @user - fully trust a user
- .featurewl - per-feature whitelist dropdown
- .automod setup - create native AutoMod rules
- .automod status - AutoMod and anti-abuse status
- .ai status - AI engine status for this server
- .ai test <message> - classify a sample message
- .ai on / .ai off - enable or disable the AI second opinion
- .webtest - test the website bridge and show the exact setup values (bot owner only)
- .owner add @user - add a co-owner (main owner only)
- .economy daily - claim the server's daily coin reward
- .economy balance / .economy pay @user <amount> - check or send coins
- .economy settings - view the server rewards (Manage Server)
- .economy setdaily <amount> - set the daily reward (Manage Server)
- .economy setinvite <amount> - set the invite reward, 0 disables it (Manage Server)
- .autorole member/bot/booster - automatic roles
- .lockdown / .unlockdown - manual lockdown and restore
- .ticket, .poll, .giveaway, .staffapply, .profile, .invites

## Per-Feature Whitelist

Use .featurewl to open the dropdown.

1. Pick a protection such as Anti Ban, Anti Kick or Anti Channel Update.
2. Select a user to add or remove.
3. That user bypasses only that protection.
4. Global whitelist still bypasses everything.

Native Discord AutoMod rules still apply to everyone. The per-feature whitelist only bypasses Zyron punishment.

## Notes

- Data is stored per server in data/database.json and is created automatically.
- Economy rewards are server-specific. Daily and invite coin amounts are configurable per server, with no premium tier.
- Minor infractions (profanity, spam, links, @everyone, mass mentions) cause delete + 10 minute mute + warning, never a ban.
- Anti-Betrayal bans only for destructive actions by trusted users.
- Raid punishment defaults to kick. Change it with .automod raidpunish ban.
- If the bot cannot ban a nuker because of role hierarchy, it triggers lockdown automatically.
