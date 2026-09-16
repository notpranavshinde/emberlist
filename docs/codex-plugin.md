# Emberlist Codex plugin

Emberlist's Codex plugin is distributed through this GitHub repository for personal installation. It is not listed in OpenAI's public plugin directory.

## Install

Install a current Codex CLI or desktop app, then run:

```bash
codex plugin marketplace add notpranavshinde/emberlist --ref main
codex plugin add emberlist@emberlist
```

Start a new Codex task so the plugin's skills and MCP tools are loaded. Choose Emberlist and complete the Google authorization screen when prompted.

The plugin source is under [`plugins/emberlist/`](../plugins/emberlist/), and the repository marketplace is [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json). Neither contains account secrets or OAuth tokens.

## Update

Refresh the repository snapshot and reinstall the plugin:

```bash
codex plugin marketplace upgrade emberlist
codex plugin add emberlist@emberlist
```

Start a new Codex task after updating.

## Remove

Remove the local plugin installation:

```bash
codex plugin remove emberlist@emberlist
```

This does not revoke an existing Emberlist connection. To revoke access immediately, open Emberlist Settings and disconnect the Codex client. You can remove the marketplace afterward with `codex plugin marketplace remove emberlist`.

## Access

The plugin connects to `https://emberlist.dev/api/mcp` through OAuth and requests the single `emberlist.workspace` permission. It can read and change tasks, projects, sections, reminders, locations, and workspace sync data. Exact workspace replacement is reserved for explicit requests.

Review the [privacy policy](https://emberlist.dev/privacy) and [terms of service](https://emberlist.dev/terms) before connecting. For help, email `support@emberlist.dev`.

## Troubleshooting

- Run `codex plugin marketplace list` to confirm the `emberlist` marketplace is configured.
- Run `codex plugin list` to confirm `emberlist@emberlist` is installed.
- Run the update commands above if an older version is cached.
- Start a new Codex task after installing or updating; existing tasks do not reload plugin definitions.
