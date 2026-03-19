package com.notpr.emberlist

import com.notpr.emberlist.domain.RecurrenceEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class RecurrenceEngineEdgeCasesTest {

    @Test
    fun dailyRecurrenceWithTimePreservation() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atTime(14, 30).atZone(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextAt(base, "FREQ=DAILY", zone, keepTime = true)
        val expected = LocalDate.of(2026, 2, 7).atTime(14, 30).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun monthlyRecurrenceOn31stHandlesShortMonths() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 1, 31).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=MONTHLY;BYMONTHDAY=31", zone)
        val expected = LocalDate.of(2026, 3, 31).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun monthlyRecurrenceOn30thHandlesFebruary() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 1, 30).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=MONTHLY;BYMONTHDAY=30", zone)
        val expected = LocalDate.of(2026, 3, 30).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun monthlyRecurrenceOn29thHandlesNonLeapYear() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 1, 29).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=MONTHLY;BYMONTHDAY=29", zone)
        val expected = LocalDate.of(2026, 3, 29).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun monthlyRecurrenceWithoutByMonthDay() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 1, 31).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=MONTHLY", zone)
        val expected = LocalDate.of(2026, 2, 28).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weeklyRecurrenceWithoutByDay() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY", zone)
        val expected = LocalDate.of(2026, 2, 13).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weeklyRecurrenceWithInterval3() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 2).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO", zone)
        val expected = LocalDate.of(2026, 2, 23).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weeklyRecurrenceMultipleDaysInPast() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 7).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=MO,TU,WE", zone)
        val expected = LocalDate.of(2026, 2, 9).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weeklyRecurrenceMultipleDaysUnsorted() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 4).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=FR,MO,WE", zone)
        val expected = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun yearlyRecurrence() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=YEARLY", zone)
        val expected = LocalDate.of(2027, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun invalidFreqReturnsNull() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=INVALID", zone)
        assertNull(next)
    }

    @Test
    fun missingFreqReturnsNull() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "INTERVAL=2", zone)
        assertNull(next)
    }

    @Test
    fun emptyRuleReturnsNull() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "", zone)
        assertNull(next)
    }

    @Test
    fun intervalWithZeroReturnsSameDate() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=DAILY;INTERVAL=0", zone)
        val expected = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun largeIntervalDoesNotOverflow() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=DAILY;INTERVAL=999999", zone)
        val expected = LocalDate.of(2026, 2, 6).plusDays(999999).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun february29LeapYear() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2024, 2, 29).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=YEARLY", zone)
        val expected = LocalDate.of(2025, 2, 28).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun monthlyRecurrenceOn31stWithInterval2() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 1, 31).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31", zone)
        // Jan 31 + 2 months = March 31 (March has 31 days)
        val expected = LocalDate.of(2026, 3, 31).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun weeklyRecurrenceWithDuplicateDays() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 2).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=MO,MO,TU", zone)
        val expected = LocalDate.of(2026, 2, 3).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun nextAtPreservesTimeWhenRequested() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atTime(15, 45).atZone(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextAt(base, "FREQ=DAILY", zone, keepTime = true)
        val expected = LocalDate.of(2026, 2, 7).atTime(15, 45).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun nextAtUsesMidnightWhenKeepTimeFalse() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 6).atTime(15, 45).atZone(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextAt(base, "FREQ=DAILY", zone, keepTime = false)
        val expected = LocalDate.of(2026, 2, 7).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun sundayToMondayRecurrence() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 8).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=MO", zone)
        val expected = LocalDate.of(2026, 2, 9).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }

    @Test
    fun saturdayToMondayRecurrence() {
        val zone = ZoneId.of("UTC")
        val base = LocalDate.of(2026, 2, 7).atStartOfDay(zone).toInstant().toEpochMilli()
        val next = RecurrenceEngine.nextDue(base, "FREQ=WEEKLY;BYDAY=MO", zone)
        val expected = LocalDate.of(2026, 2, 9).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expected, next)
    }
}
