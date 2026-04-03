import { describe, expect, it } from 'vitest';
import { extractBulkQuickAddLines, shouldPromptBulkQuickAdd, stripCommonListMarker } from './bulkQuickAdd';

describe('bulkQuickAdd', () => {
  it('strips common bullets and blank lines', () => {
    const lines = extractBulkQuickAddLines('- buy milk\n\n* call mom\n[ ] file taxes\n[x] submit report');
    expect(lines).toEqual(['buy milk', 'call mom', 'file taxes', 'submit report']);
  });

  it('keeps numbered prefixes intact', () => {
    const lines = extractBulkQuickAddLines('1. first thing\n2) second thing');
    expect(lines).toEqual(['1. first thing', '2) second thing']);
  });

  it('returns an empty list for blank input', () => {
    expect(extractBulkQuickAddLines(' \n \n')).toEqual([]);
  });

  it('strips checkbox-style markers directly', () => {
    expect(stripCommonListMarker('[x] ship update')).toBe('ship update');
    expect(stripCommonListMarker('[ ] ship update')).toBe('ship update');
  });

  it('preserves plain lines', () => {
    expect(extractBulkQuickAddLines('plain task\nanother task')).toEqual(['plain task', 'another task']);
  });

  it('only prompts for bulk add when more than one non-blank line remains', () => {
    expect(shouldPromptBulkQuickAdd('one task')).toBe(false);
    expect(shouldPromptBulkQuickAdd('one task\n\n')).toBe(false);
    expect(shouldPromptBulkQuickAdd('one task\ntwo task')).toBe(true);
    expect(shouldPromptBulkQuickAdd('- one task\n* two task')).toBe(true);
  });
});
