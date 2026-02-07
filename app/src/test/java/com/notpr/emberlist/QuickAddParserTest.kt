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
}
