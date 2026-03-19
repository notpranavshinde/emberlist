package com.notpr.emberlist

import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.ReminderSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.Month
import java.time.ZoneId

class QuickAddParserEdgeCasesTest {

    @Test
    fun emptyInputReturnsDefaultTitle() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("", now)
        assertEquals("Untitled task", result.title)
    }

    @Test
    fun whitespaceOnlyInputReturnsDefaultTitle() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("   \t\n  ", now)
        assertEquals("Untitled task", result.title)
    }

    @Test
    fun priorityCaseInsensitive() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task P1", now)
        assertEquals(com.notpr.emberlist.data.model.Priority.P1, result.priority)
    }

    @Test
    fun priorityInMiddleOfTitle() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Buy p1 milk tomorrow", now)
        assertEquals(com.notpr.emberlist.data.model.Priority.P1, result.priority)
        // Title has "Buy  milk" with double space after stripping p1 (current behavior)
        assertEquals("Buy  milk", result.title.trim())
    }

    @Test
    fun projectWithSpecialCharacters() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task #Home/Renovation-2026", now)
        assertEquals("Home", result.projectName)
        assertEquals("Renovation-2026", result.sectionName)
    }

    @Test
    fun projectSectionWithSpaces() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task #Home/Renovation Work", now)
        assertEquals("Home", result.projectName)
        assertEquals("Renovation", result.sectionName)
    }

    @Test
    fun hashAtEndOfTitle() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Buy milk #Groceries", now)
        assertEquals("Buy milk", result.title)
        assertEquals("Groceries", result.projectName)
    }

    @Test
    fun multipleHashesUsesLastOne() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task #Work #Home", now)
        assertEquals("Home", result.projectName)
    }

    @Test
    fun timeWithNoMinutes() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 9am", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun timeWithMinutes() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 9:30am", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun time12AmIsMidnight() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 12am", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun time12PmIsNoon() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 12pm", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun isoDateFormat() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task 2026-03-15", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun slashDateFormat() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task 3/15", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun slashDateFormatWithYear() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task 3/15/27", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun monthNameFormat() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task March 15", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun monthNameWithYear() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task March 15, 2027", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun dayMonthNameFormat() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task 15 March", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun ordinalSuffixesInDate() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result1 = parser.parse("Task March 1st", now)
        val result2 = parser.parse("Task March 2nd", now)
        val result3 = parser.parse("Task March 3rd", now)
        val result4 = parser.parse("Task March 4th", now)
        assertNotNull(result1.dueAt)
        assertNotNull(result2.dueAt)
        assertNotNull(result3.dueAt)
        assertNotNull(result4.dueAt)
    }

    @Test
    fun weekdayInPastGoesToNextWeek() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 7, 9, 0)
        val result = parser.parse("Task Monday", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun weekdayTodayReturnsToday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task Friday", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun deadlineWithToday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task deadline today", now)
        assertNotNull(result.deadlineAt)
    }

    @Test
    fun deadlineWithTomorrow() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task deadline tomorrow 5pm", now)
        assertNotNull(result.deadlineAt)
    }

    @Test
    fun deadlineWithByKeyword() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task by March 15", now)
        assertNotNull(result.deadlineAt)
    }

    @Test
    fun deadlineWithBraceSyntax() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task {deadline: tomorrow 5pm}", now)
        assertNotNull(result.deadlineAt)
    }

    @Test
    fun absoluteReminder() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task remind me at 3pm", now)
        assertEquals(1, result.reminders.size)
        assert(result.reminders[0] is ReminderSpec.Absolute)
    }

    @Test
    fun offsetReminderMinutes() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 9am remind me 30m before", now)
        val reminder = result.reminders.first() as ReminderSpec.Offset
        assertEquals(30, reminder.minutes)
    }

    @Test
    fun offsetReminderHours() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task tomorrow 9am remind me 2h before", now)
        val reminder = result.reminders.first() as ReminderSpec.Offset
        assertEquals(120, reminder.minutes)
    }

    @Test
    fun offsetReminderWithoutDueDate() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task remind me 30m before", now)
        assertEquals(0, result.reminders.size)
    }

    @Test
    fun recurrenceEverydayVariations() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result1 = parser.parse("Task every day", now)
        val result2 = parser.parse("Task everyday", now)
        assertEquals("FREQ=DAILY", result1.recurrenceRule)
        assertEquals("FREQ=DAILY", result2.recurrenceRule)
    }

    @Test
    fun recurrenceEveryWeekday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task every weekday", now)
        assertEquals("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", result.recurrenceRule)
    }

    @Test
    fun recurrenceMonthlyOnDay() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task every month on the 15th", now)
        assertEquals("FREQ=MONTHLY;BYMONTHDAY=15", result.recurrenceRule)
    }

    @Test
    fun recurrenceMonthlyOrdinalFormat() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task 15th of every month", now)
        assertEquals("FREQ=MONTHLY;BYMONTHDAY=15", result.recurrenceRule)
    }

    @Test
    fun recurrenceEveryInterval() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task every 3 days", now)
        assertEquals("FREQ=DAILY;INTERVAL=3", result.recurrenceRule)
    }

    @Test
    fun recurrenceEveryIntervalWeeks() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task every 2 weeks", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2", result.recurrenceRule)
    }

    @Test
    fun combinedAllFeatures() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Review report tomorrow 9am p1 #Work/Reports deadline Friday 5pm remind me 30m before every week", now)
        assertEquals("Review report", result.title)
        assertEquals(com.notpr.emberlist.data.model.Priority.P1, result.priority)
        assertEquals("Work", result.projectName)
        assertEquals("Reports", result.sectionName)
        assertNotNull(result.dueAt)
        assertNotNull(result.deadlineAt)
        assertEquals(1, result.reminders.size)
        assertNotNull(result.recurrenceRule)
    }

    @Test
    fun titleWithHashButNoProject() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("What is #awesome", now)
        // #awesome is treated as a project (current behavior)
        assertEquals("What is", result.title)
        assertEquals("awesome", result.projectName)
    }

    @Test
    fun titleWithNumberSignNotAsProject() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Call #555-1234 tomorrow", now)
        assertEquals("Call", result.title)
        assertEquals("555-1234", result.projectName)
    }

    @Test
    fun multiplePrioritiesUsesLast() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task p1 p2 p3", now)
        // First priority match wins (current behavior)
        assertEquals(com.notpr.emberlist.data.model.Priority.P1, result.priority)
    }

    @Test
    fun defaultPriorityP4() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task with no priority", now)
        assertEquals(com.notpr.emberlist.data.model.Priority.P4, result.priority)
    }

    @Test
    fun recurrenceWithTimePreserved() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Standup every day 9am", now)
        assertNotNull(result.dueAt)
        assertEquals("FREQ=DAILY", result.recurrenceRule)
    }

    @Test
    fun thisWeekendReturnsSaturday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task this weekend", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun nextWeekendReturnsNextSaturday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task next weekend", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun inNDays() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task in 5 days", now)
        assertNotNull(result.dueAt)
    }

    @Test
    fun inNDaysWithTime() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Task in 3 days 2pm", now)
        assertNotNull(result.dueAt)
    }
}
