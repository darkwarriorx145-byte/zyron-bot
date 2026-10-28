param(
  [switch]$WithNgrok,
  [switch]$NoDashboard
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BotDir = Join-Path $Root "bot"
$DashboardDir = Join-Path $Root "dashboard"
$LogDir = Join-Path $Root "logs"

if (-not (Test-Path (Join-Path $BotDir "index.js"))) {
  throw "Bot index.js not found at $BotDir"
}
if (-not (Test-Path (Join-Path $DashboardDir "index.js"))) {
  throw "Dashboard index.js not found at $DashboardDir"
}

$Node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Get-RoleProcess {
  param([string]$Role)
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*--role=$Role*" }
}

function Start-Role {
  param(
    [string]$Role,
    [string]$WorkingDirectory,
    [string]$Name
  )

  $existing = Get-RoleProcess -Role $Role
  if ($existing) {
    Write-Host "$Name is already running (PID $($existing[0].ProcessId))."
    return
  }

  $stdout = Join-Path $LogDir "$Role.out.log"
  $stderr = Join-Path $LogDir "$Role.err.log"

  $process = Start-Process `
    -FilePath $Node `
    -ArgumentList @("index.js", "--role=$Role") `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  Start-Sleep -Seconds 2
  $process.Refresh()

  if ($process.HasExited) {
    Write-Warning "$Name exited immediately. Check $stderr"
  } else {
    Write-Host "$Name started (PID $($process.Id))."
    Write-Host "  Log: $stdout"
    Write-Host "  Err: $stderr"
  }
}

Start-Role -Role "bot" -WorkingDirectory $BotDir -Name "Zyron bot"
if (-not $NoDashboard) {
  Start-Role -Role "dashboard" -WorkingDirectory $DashboardDir -Name "Zyron dashboard"
}

if ($WithNgrok) {
  $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
  if (-not $ngrok) {
    Write-Warning "ngrok is not on PATH. Install it or run ngrok manually."
  } else {
    $existing = Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like "*http*4000*" }

    if ($existing) {
      Write-Host "ngrok is already running (PID $($existing[0].ProcessId))."
    } else {
      $stdout = Join-Path $LogDir "ngrok.out.log"
      $stderr = Join-Path $LogDir "ngrok.err.log"
      $process = Start-Process `
        -FilePath $ngrok.Source `
        -ArgumentList @("http", "4000") `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru

      Start-Sleep -Seconds 2
      $process.Refresh()

      if ($process.HasExited) {
        Write-Warning "ngrok exited immediately. Check $stderr"
      } else {
        Write-Host "ngrok started (PID $($process.Id))."
        Write-Host "  Log: $stdout"
      }
    }
  }
}

Write-Host ""
Write-Host "Check status: pm2 not needed; use scripts\status-zyron.ps1"
Write-Host "Stop everything: scripts\stop-zyron.ps1"
