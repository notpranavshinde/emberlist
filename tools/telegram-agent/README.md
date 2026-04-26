# Telegram Agent

This watches a private Telegram bot and queues allowlisted messages for local
agent work.

## Configuration

Put secrets in the repo-root `.env`, which is ignored by git.

Required:

```dotenv
TELEGRAM_BOT_TOKEN=123456:bot-token-from-botfather
```

After you send `/whoami` to the bot and run the watcher once, add:

```dotenv
TELEGRAM_ALLOWED_USER_ID=123456789
```

Optional:

```dotenv
TELEGRAM_WAKE_CODEX=1
TELEGRAM_REPLY_WHEN_QUEUED=1
TELEGRAM_POLL_SECONDS=2
TELEGRAM_LONG_POLL_SECONDS=25
```

`TELEGRAM_WAKE_CODEX=1` starts `codex exec` for allowlisted messages. Leave it
off until you want unattended wake-up.

## Manual Use

Print safe config and fetch pending messages without writing state:

```powershell
.\tools\telegram-agent\run-telegram-watcher.ps1 -Once -DryRun -PrintConfig
```

Process pending messages once:

```powershell
.\tools\telegram-agent\run-telegram-watcher.ps1 -Once
```

Run continuously in the foreground:

```powershell
.\tools\telegram-agent\run-telegram-watcher.ps1
```

Queued messages are written to `.agent-telegram/inbox/`.

## Windows Startup

Install a logon scheduled task:

```powershell
.\tools\telegram-agent\install-windows-task.ps1 -Force
Start-ScheduledTask -TaskName "Emberlist Codex Telegram Watcher"
```

Remove it:

```powershell
.\tools\telegram-agent\uninstall-windows-task.ps1
```

## Safety Model

Messages are ignored for action unless their Telegram user ID matches
`TELEGRAM_ALLOWED_USER_ID`. Email-style spoofing is not possible in the same way,
but the token still controls the bot and must stay out of git.
