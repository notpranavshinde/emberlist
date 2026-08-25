import { describe, expect, it } from 'vitest';
import { conciseResult } from './mcp-auth-adapter.js';

describe('MCP replay result persistence', () => {
  it('retains only entity IDs and the revision, never workspace content', () => {
    const stored = conciseResult({
      entity: [{ id: 'task-1', title: 'private title' }, { id: 'task-2', description: 'private notes' }],
      revision: 'signed-revision',
      replayed: false,
    });

    expect(stored).toEqual({ entityIds: ['task-1', 'task-2'], revision: 'signed-revision' });
    expect(JSON.stringify(stored)).not.toMatch(/private title|private notes/u);
  });

  it('preserves one-item bulk results as entity ID arrays', () => {
    expect(conciseResult({ entity: [{ id: 'task-1' }], revision: 'revision' }))
      .toEqual({ entityIds: ['task-1'], revision: 'revision' });
  });
});
