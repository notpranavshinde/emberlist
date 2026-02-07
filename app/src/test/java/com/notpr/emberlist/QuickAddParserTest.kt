package com.notpr.emberlist

import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.ReminderSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.Month
import java.time.ZoneId

class QuickAddParserTest {
    @Test
    fun parseDueAndPriority() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Pay rent tomorrow 8am p1 #Home", now)
        assertEquals("Pay rent", result.title)
        assertNotNull(result.dueAt)
        assertEquals(com.notpr.emberlist.data.model.Priority.P1, result.priority)
        assertEquals("Home", result.projectName)
    }

    @Test
    fun parseReminderOffset() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Review report tomorrow 9am remind me 30m before", now)
        val reminder = result.reminders.first() as ReminderSpec.Offset
        assertEquals(30, reminder.minutes)
    }

    @Test
    fun parseEveryFriday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Team standup every friday", now)
        assertEquals("FREQ=WEEKLY;BYDAY=FR", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryMonday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Weekly review every monday", now)
        assertEquals("FREQ=WEEKLY;BYDAY=MO", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryMonth() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Pay rent every month", now)
        assertEquals("FREQ=MONTHLY", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryMonthDefaultsDueToToday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Pay rent every month", now)
        assertNotNull(result.dueAt)
        // Due date should default to today at start of day (all-day)
        val expectedDue = LocalDateTime.of(2026, Month.FEBRUARY, 6, 0, 0)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()
        assertEquals(expectedDue, result.dueAt)
    }

    @Test
    fun parseEveryWeek() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Check updates every week", now)
        assertEquals("FREQ=WEEKLY", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryYear() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Renew subscription every year", now)
        assertEquals("FREQ=YEARLY", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }
}
