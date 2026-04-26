param(
    [switch]$Once,
    [switch]$DryRun,
    [switch]$PrintConfig
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$ArgsList = @()
if ($Once) {
    $ArgsList += "--once"
} else {
    $ArgsList += "--poll"
}
if ($DryRun) { $ArgsList += "--dry-run" }
if ($PrintConfig) { $ArgsList += "--print-config" }

python (Join-Path $PSScriptRoot "telegram_watcher.py") @ArgsList
exit $LASTEXITCODE
