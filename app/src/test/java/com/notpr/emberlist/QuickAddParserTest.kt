package com.notpr.emberlist

import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.ReminderSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
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
    fun parseBareTimeDefaultsDueToTodayAndRemovesAtFromTitle() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Pay rent at 9:50pm", now)
        val expectedDue = LocalDateTime.of(2026, Month.FEBRUARY, 6, 21, 50)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()

        assertEquals("Pay rent", result.title)
        assertEquals(expectedDue, result.dueAt)
        assertTrue(!result.allDay)
    }

    @Test
    fun parseBareTimeWithoutAtDefaultsDueToToday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Workout 7:15pm", now)
        val expectedDue = LocalDateTime.of(2026, Month.FEBRUARY, 6, 19, 15)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()

        assertEquals("Workout", result.title)
        assertEquals(expectedDue, result.dueAt)
        assertTrue(!result.allDay)
    }

    @Test
    fun parseBarePastTimeKeepsTodayAndDoesNotRollForward() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 23, 0)
        val result = parser.parse("Laundry at 9:50pm", now)
        val expectedDue = LocalDateTime.of(2026, Month.FEBRUARY, 6, 21, 50)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()

        assertEquals(expectedDue, result.dueAt)
        assertTrue(result.dueAt!! < now.atZone(ZoneId.of("UTC")).toInstant().toEpochMilli())
    }

    @Test
    fun parseExplicitDateStillOverridesBareTimeRule() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Doctor aug 14 9:50pm", now)
        val expectedDue = LocalDateTime.of(2026, Month.AUGUST, 14, 21, 50)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()

        assertEquals("Doctor", result.title)
        assertEquals(expectedDue, result.dueAt)
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

    @Test
    fun parseEveryOtherDay() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Take meds every other day", now)
        assertEquals("FREQ=DAILY;INTERVAL=2", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherWeek() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Grocery run every other week", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherMonth() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Pay rent every other month", now)
        assertEquals("FREQ=MONTHLY;INTERVAL=2", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherYear() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Review plan every other year", now)
        assertEquals("FREQ=YEARLY;INTERVAL=2", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherMonday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Laundry every other monday", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherMonAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Workout every other mon", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherSunday() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Plan week every other sunday", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherTueAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Meetings every other tue", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherWedAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Report every other wed", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherThuAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Review every other thu", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherFriAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Prep every other fri", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherSatAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Clean every other sat", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }

    @Test
    fun parseEveryOtherSunAbbrev() {
        val parser = QuickAddParser(ZoneId.of("UTC"))
        val now = LocalDateTime.of(2026, Month.FEBRUARY, 6, 9, 0)
        val result = parser.parse("Reset every other sun", now)
        assertEquals("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU", result.recurrenceRule)
        assertNotNull(result.dueAt)
    }
}
