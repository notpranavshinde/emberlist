import { describe, expect, it } from 'vitest';
import { resolveGoShortcut, shortcutSections } from './webShortcuts';

describe('webShortcuts', () => {
  it('maps go-to shortcut sequences to existing routes', () => {
    expect(resolveGoShortcut('i')).toBe('/inbox');
    expect(resolveGoShortcut('t')).toBe('/today');
    expect(resolveGoShortcut('u')).toBe('/upcoming');
    expect(resolveGoShortcut('b')).toBeNull();
    expect(resolveGoShortcut('p')).toBe('__project_switcher__');
    expect(resolveGoShortcut('s')).toBe('/settings');
    expect(resolveGoShortcut('h')).toBe('/today');
    expect(resolveGoShortcut('x')).toBeNull();
  });

  it('documents the implemented shortcut groups', () => {
    expect(shortcutSections.map(section => section.title)).toEqual([
      'General',
      'Quick Add',
      'Navigate',
      'Task Actions',
      'Task Detail',
      'Project',
    ]);
    expect(shortcutSections.some(section => section.items.some(item => item.keys === 'Shift+S'))).toBe(true);
    expect(shortcutSections.some(section => section.items.some(item => item.keys === 'G then P'))).toBe(true);
    expect(shortcutSections.some(section => section.items.some(item => item.keys === 'Ctrl+]'))).toBe(true);
  });
});
