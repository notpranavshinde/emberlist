package com.notpr.emberlist.domain

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

object RecurrenceEngine {
    fun nextDue(currentDueAt: Long, rule: String, zoneId: ZoneId = ZoneId.systemDefault()): Long? {
        val parts = rule.split(";").associate {
            val kv = it.split("=")
            kv[0].uppercase() to kv.getOrElse(1) { "" }
        }
        val freq = parts["FREQ"] ?: return null
        val interval = parts["INTERVAL"]?.toIntOrNull() ?: 1
        val byDay = parts["BYDAY"]?.split(",")?.mapNotNull { parseDay(it) }
        val byMonthDay = parts["BYMONTHDAY"]?.toIntOrNull()

        val currentDate = Instant.ofEpochMilli(currentDueAt).atZone(zoneId).toLocalDate()

        val nextDate = when (freq) {
            "DAILY" -> currentDate.plusDays(interval.toLong())
            "WEEKLY" -> {
                if (!byDay.isNullOrEmpty()) {
                    val next = byDay
                        .map { currentDate.with(TemporalAdjusters.next(it)) }
                        .minOrNull()
                    next ?: currentDate.plusWeeks(interval.toLong())
                } else {
                    currentDate.plusWeeks(interval.toLong())
                }
            }
            "MONTHLY" -> {
                val target = currentDate.plusMonths(interval.toLong())
                if (byMonthDay != null) {
                    target.withDayOfMonth(coerceDay(target, byMonthDay))
                } else target
            }
            "YEARLY" -> currentDate.plusYears(interval.toLong())
            else -> return null
        }

        return nextDate.atStartOfDay(zoneId).toInstant().toEpochMilli()
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
}
