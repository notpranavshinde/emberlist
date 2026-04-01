export type ShortcutItem = {
  keys: string;
  description: string;
};

export type ShortcutSection = {
  title: string;
  items: ShortcutItem[];
};

export const shortcutSections: ShortcutSection[] = [
  {
    title: 'General',
    items: [
      { keys: 'J / Down', description: 'Move focus to the next task' },
      { keys: 'K / Up', description: 'Move focus to the previous task' },
      { keys: 'Enter', description: 'Open the focused task' },
      { keys: 'E', description: 'Complete or reopen the focused task' },
      { keys: 'Ctrl+E', description: 'Open the focused task editor' },
      { keys: 'Ctrl+]', description: 'Nest the focused task under the previous task' },
      { keys: 'Ctrl+[', description: 'Promote the focused subtask one level' },
      { keys: 'Esc', description: 'Dismiss dialogs and prompts' },
      { keys: 'Z / Ctrl+Z', description: 'Undo the latest undoable change' },
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: 'M', description: 'Open or close the sidebar' },
    ],
  },
  {
    title: 'Quick Add',
    items: [
      { keys: 'Q', description: 'Open Quick Add' },
      { keys: 'Ctrl+Enter', description: 'Create the task and close Quick Add' },
      { keys: 'Ctrl+Shift+Enter', description: 'Create the task and keep Quick Add open' },
      { keys: 'Tab / Shift+Tab', description: 'Move across fields and actions' },
    ],
  },
  {
    title: 'Navigate',
    items: [
      { keys: 'H', description: 'Go to Today' },
      { keys: 'Ctrl+K', description: 'Open Search and focus the query field' },
      { keys: 'G then I', description: 'Go to Inbox' },
      { keys: 'G then T', description: 'Go to Today' },
      { keys: 'G then U', description: 'Go to Upcoming' },
      { keys: 'G then B', description: 'Go to Browse' },
      { keys: 'G then S', description: 'Go to Settings' },
    ],
  },
  {
    title: 'Today Selection',
    items: [
      { keys: 'X', description: 'Select the focused task' },
      { keys: 'Ctrl+A', description: 'Select all visible Today tasks' },
      { keys: 'T', description: 'Reschedule selected Today tasks' },
      { keys: 'V', description: 'Move selected Today tasks' },
      { keys: 'Y', description: 'Change priority for selected Today tasks' },
      { keys: 'Delete / Backspace', description: 'Delete selected Today tasks' },
    ],
  },
  {
    title: 'Task Detail',
    items: [
      { keys: 'Ctrl+S', description: 'Save the current task' },
      { keys: 'E', description: 'Complete or reopen the current task' },
      { keys: 'Y', description: 'Focus priority' },
      { keys: 'T / Shift+T', description: 'Focus or clear the due date' },
      { keys: 'D / Shift+D', description: 'Focus or clear the deadline' },
      { keys: 'Esc', description: 'Go back from task detail' },
    ],
  },
  {
    title: 'Project and Browse',
    items: [
      { keys: 'S', description: 'Focus the Add section field on a project page' },
      { keys: 'A', description: 'Focus the Create project field on Browse' },
    ],
  },
];

export function resolveGoShortcut(key: string): string | null {
  switch (key.toLowerCase()) {
    case 'i':
      return '/inbox';
    case 't':
      return '/today';
    case 'u':
      return '/upcoming';
    case 'b':
      return '/browse';
    case 's':
      return '/settings';
    case 'h':
      return '/today';
    default:
      return null;
  }
}
