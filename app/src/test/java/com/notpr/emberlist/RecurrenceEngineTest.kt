package com.notpr.emberlist

import com.notpr.emberlist.domain.RecurrenceEngine
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class RecurrenceEngineTest {
    @Test
    fun dailyRecurrence() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=DAILY", zone)
        val expected = LocalDate.of(2026, 2, 7).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weekdayRecurrence() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli() // Friday
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", zone)
        val expected = LocalDate.of(2026, 2, 9).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun everyOtherMonday() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 2).atStartOfDay(zone).toInstant().toEpochMilli() // Monday
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", zone)
        val expected = LocalDate.of(2026, 2, 16).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun everyOtherWeekMultipleDays() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 3).atStartOfDay(zone).toInstant().toEpochMilli() // Tuesday
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", zone)
        val expected = LocalDate.of(2026, 2, 5).atStartOfDay(zone).toInstant().toEpochMilli() // Thursday same week
        assertEquals(expected, next)
    }

    @Test
    fun everyOtherWeekWrapsToNextIntervalWeek() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 5).atStartOfDay(zone).toInstant().toEpochMilli() // Thursday
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", zone)
        val expected = LocalDate.of(2026, 2, 17).atStartOfDay(zone).toInstant().toEpochMilli() // Tuesday two weeks later
        assertEquals(expected, next)
    }
}
