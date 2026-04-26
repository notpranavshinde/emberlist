param(
    [string]$TaskName = "Emberlist Codex Mail Watcher",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Runner = Join-Path $PSScriptRoot "run-mail-watcher.ps1"

if ((Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) -ne $null) {
    if (-not $Force) {
        throw "Scheduled task '$TaskName' already exists. Re-run with -Force to replace it."
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 7) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Polls the Codex mailbox and queues allowlisted emails for local agent work." `
    -User $env:USERNAME | Out-Null

Write-Host "Registered scheduled task '$TaskName'. It starts at Windows logon."
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Queue/state directory: $RepoRoot\.agent-mail"
