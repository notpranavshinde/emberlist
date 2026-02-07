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
}
