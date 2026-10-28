$startup = [Environment]::GetFolderPath("Startup")
$target = Join-Path $PSScriptRoot "start-zyron.ps1"
$shortcutPath = Join-Path $startup "Zyron Bot.lnk"

if (-not (Test-Path $target)) {
  throw "start-zyron.ps1 not found at $target"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $target + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Start Zyron bot and dashboard in the background"
$shortcut.Save()

Write-Host "Created startup shortcut:"
Write-Host $shortcutPath
Write-Host ""
Write-Host "It will run when this Windows user logs in."
Write-Host "To remove it, delete that shortcut."
