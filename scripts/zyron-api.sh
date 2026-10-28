#!/usr/bin/env bash
# Zyron Bot API CLI (curl)
#
# Setup:
#   export ZYRON_API_URL="https://your-ngrok-url.ngrok-free.app"
#   export ZYRON_API_KEY="your-bot-api-key"
#
# Or create ~/.zyron-api.env:
#   ZYRON_API_URL='https://your-ngrok-url.ngrok-free.app'
#   ZYRON_API_KEY='your-bot-api-key'
#   chmod 600 ~/.zyron-api.env
#
# Usage:
#   ./zyron-api.sh health
#   ./zyron-api.sh guilds
#   ./zyron-api.sh settings 123456789012345678
#   ./zyron-api.sh set 123456789012345678 prefix=! antiNukeEnabled=true
#   ./zyron-api.sh set-json 123456789012345678 '{"prefix":"!","antiNukeEnabled":true}'
#   ./zyron-api.sh raw GET /api/meta
#   ./zyron-api.sh watch 15
#   ./zyron-api.sh doctor

set -u

CONFIG="${ZYRON_API_CONFIG:-$HOME/.zyron-api.env}"
if [ -f "$CONFIG" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG"
fi

BASE="${ZYRON_API_URL:-}"
KEY="${ZYRON_API_KEY:-}"
BASE="${BASE%/}"

usage() {
  cat <<'EOF'
Zyron Bot API CLI

Commands:
  ping                         Public ping (no key needed)
  health | status              Bot API health
  guilds                       List servers and settings
  meta                         Co-owners, version, bot status
  settings <guildId>           Show one server's settings
  set <guildId> key=value ...  Update settings (needs node)
  set-json <guildId> <json>    Update settings with raw JSON
  raw <METHOD> <path> [json]   Call any API path
  watch [seconds]              Poll health every N seconds (default 10)
  doctor                       Check config and dependencies
  help                         Show this help

Environment:
  ZYRON_API_URL                ngrok public URL
  ZYRON_API_KEY                BOT_API_KEY from the bot .env
  ZYRON_API_CONFIG             Config file path (default ~/.zyron-api.env)

Examples:
  ./zyron-api.sh set 123456789012345678 prefix=! antiNukeEnabled=true
  ./zyron-api.sh set 123456789012345678 features.antiSpam=false
  ./zyron-api.sh set 123456789012345678 economyDaily=250
  ./zyron-api.sh set-json 123456789012345678 '{"punishment":"kick"}'

Notes:
  - ngrok free URLs change when ngrok restarts. Update ZYRON_API_URL.
  - The ngrok-skip-browser-warning header is sent automatically.
  - Install jq for pretty JSON: pkg install jq
EOF
}

need_config() {
  if [ -z "$BASE" ]; then
    echo "ZYRON_API_URL is not set." >&2
    echo "Example: export ZYRON_API_URL='https://your-ngrok-url.ngrok-free.app'" >&2
    exit 1
  fi
}

need_key() {
  need_config
  if [ -z "$KEY" ]; then
    echo "ZYRON_API_KEY is not set." >&2
    echo "Example: export ZYRON_API_KEY='your-bot-api-key'" >&2
    exit 1
  fi
}

pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local args=(-sS --connect-timeout 10 --max-time 30 -X "$method" "$BASE$path")
  args+=(-H "Accept: application/json")
  args+=(-H "ngrok-skip-browser-warning: true")
  if [ -n "$KEY" ]; then
    args+=(-H "Authorization: Bearer $KEY")
  fi
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}"
}

build_json() {
  if ! command -v node >/dev/null 2>&1; then
    echo "node is required for key=value. Use set-json with raw JSON instead." >&2
    exit 1
  fi

  node -e '
    const out = {};
    for (const pair of process.argv.slice(1)) {
      const i = pair.indexOf("=");
      if (i < 1) continue;
      const key = pair.slice(0, i);
      const raw = pair.slice(i + 1);
      let value = raw;
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (/^-?\d+(\.\d+)?$/.test(raw) && !/^(logChannel|autoRoleId|autoRoleBotId|boosterRoleId)$/.test(key)) value = Number(raw);
      const parts = key.split(".");
      let obj = out;
      for (let j = 0; j < parts.length - 1; j++) {
        if (!obj[parts[j]] || typeof obj[parts[j]] !== "object") obj[parts[j]] = {};
        obj = obj[parts[j]];
      }
      obj[parts[parts.length - 1]] = value;
    }
    process.stdout.write(JSON.stringify(out));
  ' "$@"
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  ping)
    need_config
    api GET /api/ping | pretty
    ;;
  health|status)
    need_key
    api GET /api/health | pretty
    ;;
  guilds)
    need_key
    api GET /api/guilds | pretty
    ;;
  meta)
    need_key
    api GET /api/meta | pretty
    ;;
  settings)
    need_key
    if [ $# -lt 1 ]; then
      echo "Usage: $0 settings <guildId>" >&2
      exit 1
    fi
    api GET "/api/guilds/$1/settings" | pretty
    ;;
  set)
    need_key
    if [ $# -lt 2 ]; then
      echo "Usage: $0 set <guildId> key=value [key=value...]" >&2
      exit 1
    fi
    guild="$1"
    shift
    body="$(build_json "$@")"
    api PATCH "/api/guilds/$guild/settings" "$body" | pretty
    ;;
  set-json)
    need_key
    if [ $# -lt 2 ]; then
      echo "Usage: $0 set-json <guildId> '<json>'" >&2
      exit 1
    fi
    api PATCH "/api/guilds/$1/settings" "$2" | pretty
    ;;
  raw)
    need_key
    if [ $# -lt 2 ]; then
      echo "Usage: $0 raw <METHOD> <path> [json]" >&2
      exit 1
    fi
    api "$1" "$2" "${3:-}" | pretty
    ;;
  watch)
    need_key
    interval="${1:-10}"
    while true; do
      date
      api GET /api/health | pretty
      sleep "$interval"
    done
    ;;
  doctor)
    echo "Config: $CONFIG"
    if [ -n "$BASE" ]; then
      echo "URL: $BASE"
    else
      echo "URL: not set"
    fi
    if [ -n "$KEY" ]; then
      echo "Key: set (${#KEY} chars)"
    else
      echo "Key: not set"
    fi
    if command -v curl >/dev/null 2>&1; then
      echo "curl: yes"
    else
      echo "curl: no"
    fi
    if command -v jq >/dev/null 2>&1; then
      echo "jq: yes"
    else
      echo "jq: no (install for pretty output)"
    fi
    if command -v node >/dev/null 2>&1; then
      echo "node: yes"
    else
      echo "node: no (set key=value needs node)"
    fi
    if [ -n "$BASE" ]; then
      echo "Ping:"
      api GET /api/ping | pretty
    fi
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
