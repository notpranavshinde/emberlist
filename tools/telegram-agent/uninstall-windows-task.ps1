param(
    [string]$TaskName = "Emberlist Codex Telegram Watcher"
)

$ErrorActionPreference = "Stop"

if ((Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) -eq $null) {
    Write-Host "Scheduled task '$TaskName' is not installed."
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'."
