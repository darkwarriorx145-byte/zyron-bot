# Zyron Dashboard

A modern, minimal dark dashboard for the Zyron Discord bot.
Sign in with Discord, pick a server, and configure every protection.
Powered by Zyra Nodes Limited.

## Features

- Discord OAuth only. No passwords, no email login.
- Server picker shows only servers where you are owner, have Manage Server, or have Administrator.
- "Configure" when Zyron is in the server, "Add Bot to Server" when it is not.
- Per-server settings: prefix, punishments, log channel, auto roles, 24 protections and economy rewards.
- AI Guard panel: enable or disable, model, confidence threshold, action, and a live test button.
- Main admin panel for the bot owner. It lists every server where the bot is installed and links to each settings page.
- Every server has completely separate settings in the bot database.
- Dashboard changes apply on the next bot event without restarting. The bot merges only dashboard-managed settings and preserves warnings, invites, coins, and other runtime data.
- Remote bot bridge for Pterodactyl + Netlify. The dashboard talks to the running bot over a key-protected HTTPS API instead of a shared file.
- Built-in Link Test page and `/api/link-test` endpoint. They show whether the website can reach the bot.
- No premium tier. Every feature is available to every server.

## Package

Use `Zyron-Dashboard-Source.zip` for GitHub/Netlify. Netlify installs the dependencies.
Use `Zyron-Dashboard.zip` for localhost if you want `node_modules` included.

## Requirements

- Node.js 18 or newer (Node 20 or 22 LTS recommended)
- A Discord application with a bot user
- The same bot token as the Zyron bot (for live server names and icons in local mode)
- An OpenRouter key (optional, for the AI test button and AI settings)
- A Netlify account when you deploy the website there

## Setup

1. Open a terminal in this folder.
2. Copy `.env.example` to `.env`.
3. Fill in the Discord OAuth values and the bot token.
4. Run `npm install` (skip this if the package already includes `node_modules`).
5. Run `npm start`.
6. Open http://localhost:3000

## Discord OAuth

1. Open https://discord.com/developers/applications
2. Select the Zyron application.
3. Open OAuth2 -> General.
4. Add these redirect URIs exactly:

   http://localhost:3000/auth/discord/callback
   http://127.0.0.1:3000/auth/discord/callback
   https://your-site.netlify.app/auth/discord/callback

   Add every host and port you actually use. `localhost` and `127.0.0.1` are different redirect URIs to Discord. The Netlify URL must be the exact site URL, including a custom domain if you use one.
5. Copy the Client ID and Client Secret into `.env` (or the Netlify environment variables).
6. Start the dashboard and open `http://localhost:3000/auth/debug` (or `http://127.0.0.1:3000/auth/debug`). The `callbackURL` value is the exact URL to register.
7. For Netlify, open `https://your-site.netlify.app/auth/debug` after deployment and confirm the `callbackURL` matches the redirect URI saved in Discord.

If Discord shows `Invalid OAuth2 redirect_uri`, open `/auth/debug` on the same host you use for the dashboard, copy `callbackURL`, add it to OAuth2 -> General -> Redirects, save, and restart the dashboard. The dashboard derives the callback from the browser host automatically, so the registered URL must match the address bar exactly.

The OAuth scopes are `identify` and `guilds`. Zyron never sees a Discord password.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DASHBOARD_PORT` | No | Port to listen on. Default 3000. |
| `SESSION_SECRET` | Yes | Long random string used to sign sessions. |
| `DISCORD_CLIENT_ID` | Yes | Discord application client ID. |
| `DISCORD_CLIENT_SECRET` | Yes | Discord application client secret. |
| `DISCORD_REDIRECT_URI` | Yes | Fallback callback. The dashboard also derives the callback from the browser host; register the exact URL shown at `/auth/debug`. |
| `MAIN_ADMIN_DISCORD_ID` | No | Your Discord user ID. Unlocks `/admin`. |
| `BOT_TOKEN` | No | Bot token for live guild lookup. Also used by the server-picker fallback when the bot API is offline. |
| `BOT_API_URL` | For remote mode | Public HTTPS URL of the bot API, for example `https://bot-api.yourdomain.com`. Leave empty for local mode. |
| `BOT_API_KEY` | For remote mode | The exact same long secret as `BOT_API_KEY` in the bot `.env`. |
| `DASHBOARD_PUBLIC_URL` | Recommended | Public URL of this website. Local: `http://localhost:3000`. Netlify: `https://your-site.netlify.app`. |
| `OPENROUTER_API_KEY` | No | Used by the AI test button. |
| `OPENROUTER_MODEL` | No | Default model. `openrouter/auto` needs credits. |
| `OPENROUTER_FALLBACK_MODEL` | No | First free fallback. Default `poolside/laguna-s-2.1:free`. |
| `OPENROUTER_FALLBACK_MODEL_2` | No | Last free fallback. Default `openrouter/free`. |
| `BOT_DB_PATH` | Local mode only | Path to the bot database. Default `../bot/data/database.json`. Not used when `BOT_API_URL` and `BOT_API_KEY` are set. |
| `DASHBOARD_SECURE_COOKIES` | No | Set to `true` when served over HTTPS. Netlify always uses HTTPS, so set it to `true` there. |

## Database

### Local mode (website and bot on the same PC)

The dashboard reads and writes the same file as the bot. It checks both layouts automatically:

    ../bot/data/database.json    (full project: bot/ next to dashboard/)
    ../data/database.json        (complete package: bot files at the package root)

`BOT_DB_PATH` can point at an absolute path or a mounted shared file. Both processes must be able to read and write that file.

### Remote mode (bot on Pterodactyl, website on Netlify)

Set `BOT_API_URL` and `BOT_API_KEY` on the website. The dashboard then stops touching `database.json` and sends every read and write to the bot API:

    GET   /api/health
    GET   /api/link-status
    GET   /api/guilds
    GET   /api/guilds/:id/settings
    PATCH /api/guilds/:id/settings
    POST  /api/heartbeat
    GET   /api/meta

The bot API is protected by the shared `BOT_API_KEY`. The dashboard sends the key as a Bearer token. The bot records a heartbeat whenever an authenticated dashboard page loads, so the `.webtest` command can confirm the link.

The dashboard never needs the bot database file in remote mode. This is the correct setup for Pterodactyl + Netlify.

If the bot API is temporarily unreachable, the dashboard falls back to Discord's bot guild list (using `BOT_TOKEN`) and the local bot database. The server picker still shows the bot as installed instead of saying "not invited". An offline banner explains that live settings are unavailable, and saving changes still requires the bot API to be reachable.

## AI Test

The test button sends one sample message to OpenRouter. It never punishes anyone.
If the key has no credits and the free daily quota is used up, the result shows a rate-limit error. Add credits at https://openrouter.ai/settings/credits or wait for the free quota to reset.

## Deployment

### Localhost first

1. Run `npm install` inside `dashboard/` (skip it if `node_modules` is included).
2. Copy `.env.example` to `.env` and fill in the Discord OAuth values.
3. Leave `BOT_API_URL` and `BOT_API_KEY` empty if the bot runs on the same PC and shares `database.json`.
4. Run `npm start`.
5. Open `http://localhost:3000` and sign in with Discord.
6. Open `/link-test` to confirm the bridge state.

To test the remote bridge from localhost, start the bot (or the bot API) somewhere reachable, set `BOT_API_URL` and `BOT_API_KEY` in `dashboard/.env`, then restart the dashboard.

### Netlify

The dashboard includes a Netlify Function wrapper at `netlify/functions/server.js` and a `netlify.toml` file. Netlify runs the Express app as a function, so you do not need a separate Node host.

1. Push the project to GitHub, or use the Netlify CLI from the `dashboard/` folder.
2. In Netlify, create a new site from the repository.
3. If the repository root is `Zyron-Bot`, set **Base directory** to `dashboard`. The `netlify.toml` inside `dashboard/` is picked up automatically.
   If you deploy the dashboard-only package (`Zyron-Dashboard-Source.zip`) with its files at the repository root, leave **Base directory** empty. The `netlify.toml` at the root is used.
4. Build command: leave empty.
5. Publish directory: `public`.
6. Functions directory: `netlify/functions`.

Netlify CLI alternative:

    cd dashboard
    npm install
    npx netlify login
    npx netlify init
    npx netlify env:set SESSION_SECRET "a-long-random-string"
    npx netlify env:set DISCORD_CLIENT_ID "your-client-id"
    npx netlify env:set DISCORD_CLIENT_SECRET "your-client-secret"
    npx netlify env:set DISCORD_REDIRECT_URI "https://your-site.netlify.app/auth/discord/callback"
    npx netlify env:set MAIN_ADMIN_DISCORD_ID "your-discord-id"
    npx netlify env:set BOT_API_URL "https://your-bot-api-domain"
    npx netlify env:set BOT_API_KEY "the-same-secret-as-the-bot"
    npx netlify env:set DASHBOARD_PUBLIC_URL "https://your-site.netlify.app"
    npx netlify env:set DASHBOARD_SECURE_COOKIES "true"
    npx netlify deploy --prod

7. Add every variable from `.env.example` in **Site settings -> Environment variables**. At minimum:
   - `SESSION_SECRET`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI=https://your-site.netlify.app/auth/discord/callback`
   - `MAIN_ADMIN_DISCORD_ID`
   - `BOT_API_URL`
   - `BOT_API_KEY`
   - `DASHBOARD_PUBLIC_URL=https://your-site.netlify.app`
   - `DASHBOARD_SECURE_COOKIES=true`
8. Add `https://your-site.netlify.app/auth/discord/callback` to Discord OAuth2 -> General -> Redirects.
9. Deploy, open `https://your-site.netlify.app/auth/debug`, and confirm `callbackURL`.
10. Open `https://your-site.netlify.app/link-test` and confirm the bot is reachable.

Netlify Functions have a 10 second timeout on the free plan. The dashboard AI test uses an 8 second timeout so it fits. Bot API calls are fast.

### Production checklist

- Use HTTPS everywhere. Netlify is HTTPS by default.
- Set `DASHBOARD_SECURE_COOKIES=true` on Netlify.
- Set a long random `SESSION_SECRET`.
- Use the same long random `BOT_API_KEY` on the bot and the website.
- Never commit `.env` or expose `BOT_API_KEY` in client-side code.
- Rotate any token or key that was shared in chat.
- Keep the bot API behind HTTPS (Cloudflare Tunnel, a reverse proxy, or the Pterodactyl SSL allocation).

## Notes

- The server picker filters by Discord permissions. The main admin can open any server where the bot is installed by using the Manage link in `/admin`.
- The dashboard does not start the bot. Run the bot separately.
- If the bot is not in a server, the Configure button becomes Add Bot to Server with the correct guild pre-selected.
- Sessions are stored in a signed cookie, so they survive dashboard restarts as long as `SESSION_SECRET` does not change. Changing the secret signs everyone out.
- The session cookie only contains the user profile and the servers the user can manage. It never contains the bot token or the bot API key.
- `BOT_API_KEY` is sent from the dashboard server to the bot API. It is never rendered in the browser.
- The Link Test page shows the masked API key, the exact API URL, the bot identity, the API uptime, and the last dashboard heartbeat.
- If `/link-test` says "Cannot reach the bot API", check the Pterodactyl allocation, `BOT_API_URL`, `BOT_API_KEY`, and whether the bot is online.
