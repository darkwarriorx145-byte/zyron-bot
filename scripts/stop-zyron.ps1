$targets = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    ($_.Name -eq "node.exe" -and (
      $_.CommandLine -like "*--role=bot*" -or
      $_.CommandLine -like "*--role=dashboard*"
    )) -or
    ($_.Name -eq "ngrok.exe" -and $_.CommandLine -like "*http*4000*")
  }

if (-not $targets) {
  Write-Host "Nothing is running."
  exit 0
}

foreach ($p in $targets) {
  Write-Host ("Stopping {0} (PID {1})" -f $p.Name, $p.ProcessId)
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped."
