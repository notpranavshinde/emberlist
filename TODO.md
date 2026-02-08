# TODO

## Recent changes (2026-02-07)

- Forced light-only theme across the app; disabled dark mode and removed the Theme selector.
- Updated bottom navigation to Today/Upcoming/Search/Browse and simplified the top app bar on root screens.
- Redesigned task rows to match the reference (circular toggle, due date + recurrence, project/section label, light dividers).
- Added task list headers and an Overdue section on Today.
- Added project/section labels to list rows by combining tasks with projects/sections.
- Added `startOfTodayMillis` and task list mapping helpers for list screens.
- Updated Browse UI structure and styling (section headers, Inbox row, project list styling).

1. ~~Quick Add parsing:~~
   - ~~Support phrases like "every friday" and "every month" reliably.~~
   - ~~For monthly recurrence (e.g., "pay rent every month"), default due date should be today’s date and repeat same day next month unless edited.~~
2. ~~Project screen flicker:~~
   - ~~Project header and task list flicker between project name and another label; stabilize UI state.~~
3. ~~Browse menu:~~
   - ~~Two "Settings" entries; only one should exist and it should open Settings.~~
4. ~~Recurrence visibility:~~
   - ~~recurrence in Upcoming without completion should behave like this: the task should be shown in upcoming for the recurrence but on the day of the recurrence the task should not be added if the previous occurence is not complete.basically it should behave like it behaves now, and the upcoming window should just show the upcoming for visual verification purposes.~~
5. ~~Back Button~~
   - ~~There should be a arrow pointing back in top left of the screen when i enter a sub-menu, sub window that is not one of inbox, today, upcoming or browse~~
6. ~~support phrase "1st of every month"/"10th of every month", etc~~
7. ~~default for a task should all day, and not due at 9am(which is currently the case)~~
8. ~~Quick Add project suggestions:~~
   - ~~Typing # shows live project menu that updates each letter~~
   - ~~Keyboard stays open, menu closes on selection~~
   - ~~Cursor placed after inserted project name~~
9. ~~Task detail UI fixes:~~
   - ~~Task detail screen scrolls and buttons don't overlap~~
10. ~~Deadline parity:~~
    - ~~Deadline recurrence supported~~
    - ~~Deadline shown on task rows~~
11. ~~Swipe left on a task to reschecule, swipe right to delete, witha confirmation popu~~
12. ~~delete button in the task detail menu~~
13. ~~when i am in a sub menu or sub window inside inbox, today, upcoming or browse. reclicking on the main menu(inbox, today, upcoming or browse) should bring me back to the main window. it should basically function the same as the back button.~~
14. ~~remove the ability to chose accents, and keep only one accent that matches the UI of the app the best.~~
15. ~~"task_name every 2 days" doesn't work. at least it doesn't show up on coming every 2 days.~~
16. ~~swiping left on a task to reschedule should open the pick date window, and reshedule the date chosen and not automatically reschedule to any date.~~
17. ~~when i type "task_name everyday #project_name" in quick add. it adds the the task appropriately with right recurence and in the right project, but the name of the task is added as "task_name everyday" instead of just "task_name"~~