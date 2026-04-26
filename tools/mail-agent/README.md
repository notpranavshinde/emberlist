# Local Mail Agent

This watches the Codex mailbox and queues new messages for local agent work.

## Configuration

Put secrets in the repo-root `.env`, which is already ignored by git.

Required:

```dotenv
AGENT_MAIL_EMAIL=codexemberlistwebdev@gmail.com
AGENT_MAIL_PASSWORD=your-gmail-app-password
```

The watcher also accepts the existing `TEST_GOOGLE_EMAIL` and `TEST_GOOGLE_PASSWORD`
names as fallbacks, but Gmail IMAP usually requires an app password.

Optional:

```dotenv
AGENT_MAIL_ALLOWLIST=notpranavshinde@gmail.com
AGENT_MAIL_WAKE_CODEX=1
AGENT_MAIL_POLL_SECONDS=60
AGENT_MAIL_MAX_PER_POLL=10
```

Notes:

- For Gmail IMAP, `AGENT_MAIL_PASSWORD` should be an app password, not the normal Google login password.
- If `AGENT_MAIL_ALLOWLIST` is empty, mail is queued but Codex is not launched.
- If `AGENT_MAIL_WAKE_CODEX=1`, allowlisted messages launch `codex exec` in this repo.
- You can override the wake command with `AGENT_MAIL_WAKE_COMMAND`.

## Manual Test

```powershell
.\tools\mail-agent\run-mail-watcher.ps1 -Once -DryRun -PrintConfig
```

The first non-dry run establishes a mailbox baseline and does not queue old mail:

```powershell
.\tools\mail-agent\run-mail-watcher.ps1 -Once
```

To process existing mail after the baseline:

```powershell
.\tools\mail-agent\run-mail-watcher.ps1 -Once -CatchUp
```

Queued messages are written under `.agent-mail/inbox/`.

## Windows Startup

Install the watcher as a logon scheduled task:

```powershell
.\tools\mail-agent\install-windows-task.ps1 -Force
Start-ScheduledTask -TaskName "Emberlist Codex Mail Watcher"
```

Remove it:

```powershell
.\tools\mail-agent\uninstall-windows-task.ps1
```

## Safety Model

Email body text is never executed directly. Each email becomes a local markdown file. Codex is only launched for allowlisted senders when `AGENT_MAIL_WAKE_CODEX=1` is set.
