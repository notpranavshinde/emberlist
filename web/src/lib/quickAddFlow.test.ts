import { describe, expect, it } from 'vitest';
import { getQuickAddEscapeAction, shouldCloseQuickAddAfterCreate } from './quickAddFlow';

describe('quickAddFlow', () => {
  it('closes the bulk choices first when escape is pressed', () => {
    expect(getQuickAddEscapeAction(true)).toBe('dismiss-bulk');
    expect(getQuickAddEscapeAction(false)).toBe('close-dialog');
  });

  it('keeps the dialog open only for continue mode', () => {
    expect(shouldCloseQuickAddAfterCreate('close')).toBe(true);
    expect(shouldCloseQuickAddAfterCreate('continue')).toBe(false);
  });
});
