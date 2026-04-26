param(
    [switch]$Once,
    [switch]$CatchUp,
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
if ($CatchUp) { $ArgsList += "--catch-up" }
if ($DryRun) { $ArgsList += "--dry-run" }
if ($PrintConfig) { $ArgsList += "--print-config" }

python (Join-Path $PSScriptRoot "mail_watcher.py") @ArgsList
exit $LASTEXITCODE
