import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickParser';

describe('quickParser project parsing', () => {
  it('keeps project and section names with spaces when they are placed at the end', () => {
    const parsed = parseQuickAdd('Prepare outline tomorrow #Client Work/Deep Focus');

    expect(parsed.title).toBe('Prepare outline');
    expect(parsed.projectName).toBe('Client Work');
    expect(parsed.sectionName).toBe('Deep Focus');
  });
});
