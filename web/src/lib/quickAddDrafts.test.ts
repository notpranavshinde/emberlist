import { describe, expect, it } from 'vitest';
import {
  buildDraftFromParsed,
  buildTaskDetailDraftFromInput,
  createMergedBulkDraft,
  mergeBulkDraftWithDefaults,
  type QuickAddContext,
} from './quickAddDrafts';
import { parseQuickAdd } from './quickParser';
import { createEmptySyncPayload } from './syncPayload';
import type { Project, Section, SyncPayload } from '../types/sync';
import type { TaskDraft } from './workspace';

function createPayload(): SyncPayload {
  const projects: Project[] = [
    {
      id: 'project-to-buy',
      name: 'to buy',
      color: '#EE6A3C',
      favorite: false,
      order: 0,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    {
      id: 'project-bills',
      name: 'bills',
      color: '#EE6A3C',
      favorite: false,
      order: 1,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    {
      id: 'project-dailies',
      name: 'dailies',
      color: '#EE6A3C',
      favorite: false,
      order: 2,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ];
  const sections: Section[] = [
    {
      id: 'section-monthly',
      projectId: 'project-bills',
      name: 'monthly',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ];

  return {
    ...createEmptySyncPayload('device-test'),
    projects,
    sections,
  };
}

const CONTEXT: QuickAddContext = {
  defaultProjectId: null,
  defaultSectionId: null,
  defaultDueToday: false,
};

describe('quickAddDrafts', () => {
  it('assigns existing spaced projects without leaking project text into the title', () => {
    const draft = buildDraftFromParsed(
      createPayload(),
      parseQuickAdd('pillows #to buy'),
      '',
      CONTEXT,
      new Date(2026, 1, 6, 0, 0, 0, 0).getTime(),
    );

    expect(draft.title).toBe('pillows');
    expect(draft.projectId).toBe('project-to-buy');
    expect(draft.projectName).toBeNull();
  });

  it('uses per-line parser results first and falls back to bulk defaults', () => {
    const payload = createPayload();
    const todayStart = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();

    const lineWithOverrides = buildDraftFromParsed(
      payload,
      parseQuickAdd('pay rent tomorrow p2 #bills/monthly', new Date(2026, 1, 6, 9, 0, 0, 0)),
      '',
      CONTEXT,
      todayStart,
    );
    const lineWithoutOverrides = buildDraftFromParsed(
      payload,
      parseQuickAdd('laundry', new Date(2026, 1, 6, 9, 0, 0, 0)),
      '',
      CONTEXT,
      todayStart,
    );
    const defaults: TaskDraft = {
      ...lineWithoutOverrides,
      priority: 'P1',
      projectId: 'project-dailies',
      projectName: null,
      dueAt: todayStart,
      allDay: true,
    };

    const mergedOverrideLine = mergeBulkDraftWithDefaults(lineWithOverrides, defaults, 'pay rent tomorrow p2 #bills/monthly');
    const mergedPlainLine = mergeBulkDraftWithDefaults(lineWithoutOverrides, defaults, 'laundry');

    expect(mergedOverrideLine).toMatchObject({
      priority: 'P2',
      projectId: 'project-bills',
      sectionId: 'section-monthly',
      dueAt: new Date(2026, 1, 7, 0, 0, 0, 0).getTime(),
    });
    expect(mergedPlainLine).toMatchObject({
      priority: 'P1',
      projectId: 'project-dailies',
      dueAt: todayStart,
    });
  });

  it('supports task-detail style parsing for existing spaced projects and sections', () => {
    const payload = createPayload();
    const todayStart = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();

    const spacedProjectDraft = buildTaskDetailDraftFromInput(
      payload,
      'pillows #to buy',
      '',
      CONTEXT,
      todayStart,
    );
    const sectionOverrideDraft = buildTaskDetailDraftFromInput(
      payload,
      'pay rent p1 #bills/monthly',
      '',
      {
        defaultProjectId: 'project-dailies',
        defaultSectionId: null,
        defaultDueToday: false,
      },
      todayStart,
    );

    expect(spacedProjectDraft).toMatchObject({
      title: 'pillows',
      projectId: 'project-to-buy',
      projectName: null,
    });
    expect(sectionOverrideDraft).toMatchObject({
      projectId: 'project-bills',
      sectionId: 'section-monthly',
      priority: 'P1',
    });
  });

  it('falls back to single-token project matching when a spaced project does not exist', () => {
    const basePayload = createPayload();
    const payload = {
      ...basePayload,
      projects: basePayload.projects.filter(project => project.id !== 'project-to-buy'),
    };
    payload.projects.push({
      id: 'project-to',
      name: 'to',
      color: '#EE6A3C',
      favorite: false,
      order: 3,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    });

    const draft = buildTaskDetailDraftFromInput(
      payload,
      'pillows #to buy',
      '',
      CONTEXT,
      new Date(2026, 1, 6, 0, 0, 0, 0).getTime(),
    );

    expect(draft).toMatchObject({
      title: 'pillows',
      projectId: 'project-to',
      sectionId: null,
    });
  });

  it('matches spaced sections under a single-token project', () => {
    const payload = createPayload();
    payload.projects.push({
      id: 'project-shopping',
      name: 'shopping',
      color: '#EE6A3C',
      favorite: false,
      order: 4,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    });
    payload.sections.push({
      id: 'section-home-decor',
      projectId: 'project-shopping',
      name: 'home decor',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    });

    const draft = buildTaskDetailDraftFromInput(
      payload,
      'pillows #shopping/home decor',
      '',
      CONTEXT,
      new Date(2026, 1, 6, 0, 0, 0, 0).getTime(),
    );

    expect(draft).toMatchObject({
      title: 'pillows',
      projectId: 'project-shopping',
      sectionId: 'section-home-decor',
    });
  });

  it('inherits parent project and section for parsed subtasks without overrides and keeps line reminders', () => {
    const payload = createPayload();
    const parentContext: QuickAddContext = {
      defaultProjectId: 'project-dailies',
      defaultSectionId: null,
      defaultDueToday: false,
    };
    const parsed = parseQuickAdd('doctor appointment tomorrow 9am remind me 30m before', new Date(2026, 1, 6, 9, 0, 0, 0));

    const draft = buildDraftFromParsed(
      payload,
      parsed,
      '',
      parentContext,
      new Date(2026, 1, 6, 0, 0, 0, 0).getTime(),
    );

    expect(draft).toMatchObject({
      projectId: 'project-dailies',
      dueAt: new Date(2026, 1, 7, 9, 0, 0, 0).getTime(),
    });
    expect(draft.reminders).toEqual([{ kind: 'OFFSET', offsetMinutes: 30 }]);
  });

  it('joins bulk lines into a single combined title', () => {
    const merged = createMergedBulkDraft(
      createPayload(),
      ['buy milk', 'call mom', 'file taxes'],
      '',
      CONTEXT,
      new Date(2026, 1, 6, 0, 0, 0, 0).getTime(),
    );

    expect(merged.title).toBe('buy milk call mom file taxes');
  });
});
