package com.notpr.emberlist.ui

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

fun endOfTodayMillis(zoneId: ZoneId = ZoneId.systemDefault()): Long {
    val end = LocalDateTime.of(LocalDate.now(zoneId), LocalTime.MAX)
    return end.atZone(zoneId).toInstant().toEpochMilli()
}

fun startOfTomorrowMillis(zoneId: ZoneId = ZoneId.systemDefault()): Long {
    val start = LocalDate.now(zoneId).plusDays(1).atStartOfDay()
    return start.atZone(zoneId).toInstant().toEpochMilli()
}
