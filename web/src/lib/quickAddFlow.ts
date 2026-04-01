export type QuickAddSubmitMode = 'close' | 'continue';

export type QuickAddEscapeAction = 'dismiss-bulk' | 'close-dialog';

export function getQuickAddEscapeAction(showBulkChoices: boolean): QuickAddEscapeAction {
  return showBulkChoices ? 'dismiss-bulk' : 'close-dialog';
}

export function shouldCloseQuickAddAfterCreate(mode: QuickAddSubmitMode): boolean {
  return mode === 'close';
}
