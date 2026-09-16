---
name: emberlist-tasks
description: Manage an authenticated Emberlist workspace through its MCP server, including tasks, projects, sections, reminders, locations, and sync payloads. Use for reading or changing Emberlist data; do not use for changes to the Emberlist codebase.
---

# Emberlist Tasks

Use the Emberlist MCP tools for workspace operations. Keep reads targeted and prefer semantic tools over raw payload operations.

## Resolve and act

- Resolve project, section, task, reminder, and location names with list or get tools before a write. Reuse an exact ID returned by Emberlist; never invent one. Ask only when multiple matches would materially change the action.
- Use `create_task`, `update_task`, `set_task_status`, and `move_task` for their named behaviors. Use `bulk_update_tasks` only when one requested change applies to a clearly defined set.
- Use the corresponding create, update, and delete tools for projects, sections, reminders, and locations. Do not geocode or infer coordinates.
- For every write, generate a fresh `mutationId` for the logical mutation. Reuse that value only when retrying the identical request after an uncertain result.
- Do not turn a read, explanation, or planning request into a write. Keep destructive scope exact and report what was deleted.

## Dates and time

- Send all-day dates as `YYYY-MM-DD` calendar dates.
- Send timed values as RFC 3339 timestamps with an explicit numeric offset.
- Use a timezone supplied by the user or tool input; otherwise rely on the timezone stored with the Emberlist grant. Ask for clarification only when ambiguity would change the result.
- Preserve whether an existing task is all-day or timed unless the user explicitly changes it.

## Raw workspace operations

- Use `read_workspace_payload` when the user explicitly needs the versioned payload or a revision token.
- Use `merge_workspace_payload` only for an explicit import or merge request.
- Use `replace_workspace_payload` only when the user explicitly requests exact replacement. Pass the latest revision returned by `read_workspace_payload`; never silently convert replacement to merge or retry a stale-revision conflict.
- Prefer semantic tools for ordinary management because they preserve recurrence, reminders, tombstones, and repair behavior.

## Results

Summarize affected items, relevant dates, and conflicts or retries. Do not echo a full workspace payload unless the user asks for it.
