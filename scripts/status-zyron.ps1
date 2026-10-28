$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "logs"

function Show-Process {
  param(
    [string]$Name,
    [string]$Filter,
    [string]$Role
  )

  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq $Filter -and $_.CommandLine -like "*$Role*"
    }

  if ($processes) {
    foreach ($p in $processes) {
      Write-Host ("{0}: running (PID {1})" -f $Name, $p.ProcessId)
    }
  } else {
    Write-Host ("{0}: stopped" -f $Name)
  }
}

Show-Process -Name "Zyron bot" -Filter "node.exe" -Role "--role=bot"
Show-Process -Name "Zyron dashboard" -Filter "node.exe" -Role "--role=dashboard"

$ngrok = Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*http*4000*" }

if ($ngrok) {
  foreach ($p in $ngrok) {
    Write-Host ("ngrok: running (PID {0})" -f $p.ProcessId)
  }
} else {
  Write-Host "ngrok: stopped"
}

if (Test-Path $LogDir) {
  Write-Host ""
  Write-Host "Log files:"
  Get-ChildItem $LogDir -Filter "*.log" -ErrorAction SilentlyContinue |
    Sort-Object Name |
    Select-Object Name, Length, LastWriteTime |
    Format-Table -AutoSize
}
