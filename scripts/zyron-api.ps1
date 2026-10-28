# Zyron Bot API CLI for Windows PowerShell
#
# Setup:
#   $env:ZYRON_API_URL = "https://your-ngrok-url.ngrok-free.app"
#   $env:ZYRON_API_KEY = "your-bot-api-key"
#
# Usage:
#   .\zyron-api.ps1 doctor
#   .\zyron-api.ps1 health
#   .\zyron-api.ps1 guilds
#   .\zyron-api.ps1 settings 123456789012345678
#   .\zyron-api.ps1 set 123456789012345678 prefix=! antiNukeEnabled=true
#   .\zyron-api.ps1 set-json 123456789012345678 '{"prefix":"!"}'
#   .\zyron-api.ps1 raw GET /api/meta
#   .\zyron-api.ps1 watch 15

$ErrorActionPreference = "Stop"

function Show-Usage {
  @"
Zyron Bot API CLI

Commands:
  ping                         Public ping (no key needed)
  health | status              Bot API health
  guilds                       List servers and settings
  meta                         Co-owners, version, bot status
  settings <guildId>           Show one server's settings
  set <guildId> key=value ...  Update settings
  set-json <guildId> <json>    Update settings with raw JSON
  raw <METHOD> <path> [json]   Call any API path
  watch [seconds]              Poll health every N seconds (default 10)
  doctor                       Check config
  help                         Show this help

Environment:
  ZYRON_API_URL                ngrok public URL
  ZYRON_API_KEY                BOT_API_KEY from the bot .env

Examples:
  .\zyron-api.ps1 set 123456789012345678 prefix=! antiNukeEnabled=true
  .\zyron-api.ps1 set 123456789012345678 features.antiSpam=false
  .\zyron-api.ps1 set 123456789012345678 economyDaily=250
  .\zyron-api.ps1 set-json 123456789012345678 '{"punishment":"kick"}'

Notes:
  - ngrok free URLs change when ngrok restarts. Update ZYRON_API_URL.
  - The ngrok-skip-browser-warning header is sent automatically.
"@
}

function Get-BaseUrl {
  if (-not $env:ZYRON_API_URL) {
    throw "ZYRON_API_URL is not set. Example: `$env:ZYRON_API_URL = 'https://your-ngrok-url.ngrok-free.app'"
  }
  return $env:ZYRON_API_URL.TrimEnd("/")
}

function Invoke-Zyron {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Body = ""
  )

  $headers = @{
    "Accept" = "application/json"
    "ngrok-skip-browser-warning" = "true"
  }

  if ($env:ZYRON_API_KEY) {
    $headers["Authorization"] = "Bearer $($env:ZYRON_API_KEY)"
  }

  $params = @{
    Uri = "$(Get-BaseUrl)$Path"
    Method = $Method
    Headers = $headers
    TimeoutSec = 30
  }

  if ($Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = $Body
  }

  try {
    $result = Invoke-RestMethod @params
    return ($result | ConvertTo-Json -Depth 12)
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $text = $reader.ReadToEnd()
      if ($text) { return $text }
    }
    throw
  }
}

function Convert-KeyValueToJson {
  param([string[]]$Pairs)

  $body = @{}

  foreach ($pair in $Pairs) {
    $index = $pair.IndexOf("=")
    if ($index -lt 1) { continue }

    $key = $pair.Substring(0, $index)
    $raw = $pair.Substring($index + 1)
    $value = $raw

    if ($raw -eq "true") {
      $value = $true
    } elseif ($raw -eq "false") {
      $value = $false
    } elseif ($raw -match '^-?\d+(\.\d+)?$' -and $key -notmatch '^(logChannel|autoRoleId|autoRoleBotId|boosterRoleId)$') {
      $value = [double]$raw
    }

    $parts = $key.Split(".")
    $obj = $body

    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
      $part = $parts[$i]
      if (-not $obj.ContainsKey($part) -or $obj[$part] -isnot [hashtable]) {
        $obj[$part] = @{}
      }
      $obj = $obj[$part]
    }

    $obj[$parts[-1]] = $value
  }

  return ($body | ConvertTo-Json -Depth 12 -Compress)
}

$Command = if ($args.Count -ge 1) { [string]$args[0] } else { "help" }
$Rest = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }

switch ($Command.ToLower()) {
  "ping" {
    Invoke-Zyron -Method GET -Path "/api/ping"
  }
  "health" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    Invoke-Zyron -Method GET -Path "/api/health"
  }
  "status" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    Invoke-Zyron -Method GET -Path "/api/health"
  }
  "guilds" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    Invoke-Zyron -Method GET -Path "/api/guilds"
  }
  "meta" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    Invoke-Zyron -Method GET -Path "/api/meta"
  }
  "settings" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    if ($Rest.Count -lt 1) { throw "Usage: .\zyron-api.ps1 settings <guildId>" }
    Invoke-Zyron -Method GET -Path "/api/guilds/$($Rest[0])/settings"
  }
  "set" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    if ($Rest.Count -lt 2) { throw "Usage: .\zyron-api.ps1 set <guildId> key=value [key=value...]" }
    $guildId = $Rest[0]
    $pairs = @($Rest[1..($Rest.Count - 1)])
    $body = Convert-KeyValueToJson -Pairs $pairs
    Invoke-Zyron -Method PATCH -Path "/api/guilds/$guildId/settings" -Body $body
  }
  "set-json" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    if ($Rest.Count -lt 2) { throw "Usage: .\zyron-api.ps1 set-json <guildId> '<json>'" }
    Invoke-Zyron -Method PATCH -Path "/api/guilds/$($Rest[0])/settings" -Body $Rest[1]
  }
  "raw" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    if ($Rest.Count -lt 2) { throw "Usage: .\zyron-api.ps1 raw <METHOD> <path> [json]" }
    $body = if ($Rest.Count -ge 3) { $Rest[2] } else { "" }
    Invoke-Zyron -Method $Rest[0] -Path $Rest[1] -Body $body
  }
  "watch" {
    if (-not $env:ZYRON_API_KEY) { throw "ZYRON_API_KEY is not set." }
    $interval = if ($Rest.Count -ge 1) { [int]$Rest[0] } else { 10 }
    while ($true) {
      Get-Date
      Invoke-Zyron -Method GET -Path "/api/health"
      Start-Sleep -Seconds $interval
    }
  }
  "doctor" {
    Write-Output "URL: $(if ($env:ZYRON_API_URL) { $env:ZYRON_API_URL } else { 'not set' })"
    Write-Output "Key: $(if ($env:ZYRON_API_KEY) { 'set (' + $env:ZYRON_API_KEY.Length + ' chars)' } else { 'not set' })"
    if ($env:ZYRON_API_URL) {
      Write-Output "Ping:"
      Invoke-Zyron -Method GET -Path "/api/ping"
    }
  }
  "help" {
    Show-Usage
  }
  default {
    Show-Usage
    exit 1
  }
}
