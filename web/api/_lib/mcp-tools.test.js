import { describe, expect, it, vi } from 'vitest';
import { registerMcpTools } from './mcp-tools.js';

describe('MCP tool registration', () => {
  it('exposes the complete annotated workspace surface', () => {
    const tools = new Map();
    const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
    const store = { read: vi.fn(), semantic: vi.fn(), merge: vi.fn(), replaceExact: vi.fn() };
    registerMcpTools(server, store, 'America/Phoenix');

    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      'list_tasks', 'get_task', 'list_projects', 'list_reminders', 'list_locations', 'read_workspace_payload',
      'create_task', 'update_task', 'set_task_status', 'move_task', 'bulk_update_tasks', 'delete_tasks',
      'create_project', 'update_project', 'delete_project', 'create_section', 'update_section', 'delete_section',
      'create_reminder', 'update_reminder', 'delete_reminder', 'create_location', 'update_location', 'delete_location',
      'merge_workspace_payload', 'replace_workspace_payload',
    ]));
    expect(tools.size).toBe(26);
    expect(tools.get('list_tasks').config.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(tools.get('delete_tasks').config.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.get('replace_workspace_payload').config.annotations).toMatchObject({ destructiveHint: true });
  });

  it('includes sections with projects for section ID resolution', async () => {
    const tools = new Map();
    const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
    const store = { read: vi.fn().mockResolvedValue({ revision: 'rev', payload: {
      projects: [{ id: 'p1', name: 'Work', order: 0, archived: false, deletedAt: null }],
      sections: [{ id: 's1', projectId: 'p1', name: 'Next', order: 0, deletedAt: null }],
    } }), semantic: vi.fn(), merge: vi.fn(), replaceExact: vi.fn() };
    registerMcpTools(server, store, 'UTC');
    const response = await tools.get('list_projects').callback({ limit: 50 });
    expect(response.structuredContent.items[0].sections).toEqual([
      expect.objectContaining({ id: 's1', name: 'Next' }),
    ]);
  });

  it('derives all-day flags from date formats and rejects calendar reminder times', async () => {
    const tools = new Map();
    const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
    const store = { read: vi.fn(), semantic: vi.fn().mockResolvedValue({ ok: true }), merge: vi.fn(), replaceExact: vi.fn() };
    registerMcpTools(server, store, 'America/Phoenix');

    const create = tools.get('create_task');
    await create.callback(create.config.inputSchema.parse({ mutationId: 'mutation-date', title: 'All day', dueAt: '2026-08-21' }));
    expect(store.semantic).toHaveBeenLastCalledWith('create_task', expect.objectContaining({
      dueAt: new Date('2026-08-21T07:00:00Z').getTime(), allDay: true,
    }));
    await create.callback(create.config.inputSchema.parse({ mutationId: 'mutation-time', title: 'Timed', dueAt: '2026-08-21T09:30:00-07:00' }));
    expect(store.semantic).toHaveBeenLastCalledWith('create_task', expect.objectContaining({ allDay: false }));
    await expect(create.callback(create.config.inputSchema.parse({ mutationId: 'mutation-bad', title: 'Bad',
      dueAt: '2026-08-21', allDay: false }))).rejects.toThrow('contradicts');
    expect(() => tools.get('create_reminder').config.inputSchema.parse({ mutationId: 'mutation-reminder',
      taskId: 't1', type: 'TIME', timeAt: '2026-08-21' })).toThrow();
  });

  it('defaults task listing to a useful 20-item open page while retaining explicit history access', async () => {
    const tools = new Map();
    const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
    const tasks = [
      ...Array.from({ length: 25 }, (_, index) => task(`open-${index}`, 'OPEN', index)),
      task('completed', 'COMPLETED', 30),
      { ...task('deleted', 'OPEN', 31), deletedAt: 10 },
    ];
    const store = { read: vi.fn().mockResolvedValue({ revision: 'rev', payload: { tasks } }),
      semantic: vi.fn(), merge: vi.fn(), replaceExact: vi.fn() };
    registerMcpTools(server, store, 'UTC');
    const list = tools.get('list_tasks');

    const first = await list.callback(list.config.inputSchema.parse({}));
    expect(first.structuredContent.items).toHaveLength(20);
    expect(first.structuredContent.items.every(item => item.status === 'OPEN' && !item.deletedAt)).toBe(true);
    expect(first.structuredContent.nextCursor).toBeTruthy();

    const second = await list.callback(list.config.inputSchema.parse({ cursor: first.structuredContent.nextCursor }));
    expect(second.structuredContent.items).toHaveLength(5);
    expect(second.structuredContent.nextCursor).toBeNull();

    const completed = await list.callback(list.config.inputSchema.parse({ status: 'COMPLETED' }));
    expect(completed.structuredContent.items.map(item => item.id)).toEqual(['completed']);
    const history = await list.callback(list.config.inputSchema.parse({ includeDeleted: true, limit: 100 }));
    expect(history.structuredContent.items.map(item => item.id)).toContain('deleted');
    expect(history.structuredContent.items.map(item => item.id)).toContain('completed');
  });

  it('documents opaque IDs and the entity/revision/replay write response contract', () => {
    const tools = new Map();
    const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
    const store = { read: vi.fn(), semantic: vi.fn(), merge: vi.fn(), replaceExact: vi.fn() };
    registerMcpTools(server, store, 'UTC');

    expect(tools.get('get_task').config.inputSchema.shape.taskId.description).toContain('Opaque cross-client ID');
    expect(tools.get('create_task').config.outputSchema.parse({
      entity: { id: 'successor:opaque-format' }, revision: 'signed-revision', replayed: false,
    })).toEqual({ entity: { id: 'successor:opaque-format' }, revision: 'signed-revision', replayed: false });
    expect(tools.get('create_task').config.description).toContain('committed revision');
  });
});

function task(id, status, order) {
  return {
    id, title: id, description: '', projectId: null, sectionId: null, priority: 'P4', dueAt: null,
    allDay: true, deadlineAt: null, deadlineAllDay: false, recurringRule: null,
    deadlineRecurringRule: null, status, completedAt: status === 'COMPLETED' ? 1 : null,
    parentTaskId: null, locationId: null, locationTriggerType: null, order,
    createdAt: 1, updatedAt: 1, deletedAt: null,
  };
}
