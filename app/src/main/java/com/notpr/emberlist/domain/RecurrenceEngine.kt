package com.notpr.emberlist.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

object RecurrenceEngine {
    fun nextDue(currentDueAt: Long, rule: String, zoneId: ZoneId = ZoneId.systemDefault()): Long? {
        return nextAt(currentDueAt, rule, zoneId, keepTime = false)
    }

    fun nextAt(
        currentAt: Long,
        rule: String,
        zoneId: ZoneId = ZoneId.systemDefault(),
        keepTime: Boolean = true
    ): Long? {
        val parts = rule.split(";").associate {
            val kv = it.split("=")
            kv[0].uppercase() to kv.getOrElse(1) { "" }
        }
        val freq = parts["FREQ"] ?: return null
        val interval = parts["INTERVAL"]?.toIntOrNull() ?: 1
        val byDay = parts["BYDAY"]?.split(",")?.mapNotNull { parseDay(it) }
        val byMonthDay = parts["BYMONTHDAY"]?.toIntOrNull()

        val currentZoned = Instant.ofEpochMilli(currentAt).atZone(zoneId)
        val currentDate = currentZoned.toLocalDate()
        val currentTime = currentZoned.toLocalTime()

        val nextDate = when (freq) {
            "DAILY" -> currentDate.plusDays(interval.toLong())
            "WEEKLY" -> {
                if (!byDay.isNullOrEmpty()) {
                    val sortedDays = byDay.distinct().sortedBy { it.value }
                    val currentDow = currentDate.dayOfWeek
                    val laterDay = sortedDays.firstOrNull { it.value > currentDow.value }
                    if (laterDay != null) {
                        currentDate.with(TemporalAdjusters.next(laterDay))
                    } else {
                        val firstDay = sortedDays.first()
                        val baseNext = currentDate.with(TemporalAdjusters.next(firstDay))
                        if (interval > 1) baseNext.plusWeeks((interval - 1).toLong()) else baseNext
                    }
                } else {
                    currentDate.plusWeeks(interval.toLong())
                }
            }
            "MONTHLY" -> {
                if (byMonthDay != null) {
                    findMonthWithDay(currentDate, interval, byMonthDay)
                } else {
                    currentDate.plusMonths(interval.toLong())
                }
            }
            "YEARLY" -> currentDate.plusYears(interval.toLong())
            else -> return null
        }

        val time = if (keepTime) currentTime else LocalTime.MIDNIGHT
        return LocalDateTime.of(nextDate, time).atZone(zoneId).toInstant().toEpochMilli()
    }

    private fun parseDay(token: String): DayOfWeek? {
        return when (token.uppercase()) {
            "MO" -> DayOfWeek.MONDAY
            "TU" -> DayOfWeek.TUESDAY
            "WE" -> DayOfWeek.WEDNESDAY
            "TH" -> DayOfWeek.THURSDAY
            "FR" -> DayOfWeek.FRIDAY
            "SA" -> DayOfWeek.SATURDAY
            "SU" -> DayOfWeek.SUNDAY
            else -> null
        }
    }

    private fun coerceDay(date: LocalDate, day: Int): Int {
        val max = date.lengthOfMonth()
        return day.coerceIn(1, max)
    }

    private fun findMonthWithDay(base: LocalDate, interval: Int, targetDay: Int): LocalDate {
        var candidate = base.plusMonths(interval.toLong())
        while (candidate.lengthOfMonth() < targetDay) {
            candidate = candidate.plusMonths(1)
        }
        return candidate.withDayOfMonth(targetDay)
    }
}
