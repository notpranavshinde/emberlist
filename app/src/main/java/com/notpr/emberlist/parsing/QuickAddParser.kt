package com.notpr.emberlist.parsing

import com.notpr.emberlist.data.model.Priority
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

const val DEFAULT_TIME_HOUR = 9

sealed class ReminderSpec {
    data class Absolute(val timeAtMillis: Long) : ReminderSpec()
    data class Offset(val minutes: Int) : ReminderSpec()
}

data class QuickAddResult(
    val title: String,
    val dueAt: Long?,
    val deadlineAt: Long?,
    val priority: Priority,
    val projectName: String?,
    val recurrenceRule: String?,
    val reminders: List<ReminderSpec>
)

class QuickAddParser(private val zoneId: ZoneId = ZoneId.systemDefault()) {
    private val timeRegex = Regex("(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm)", RegexOption.IGNORE_CASE)
    private val explicitDateRegex = Regex("(\\d{4})-(\\d{1,2})-(\\d{1,2})|(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?")

    fun parse(input: String, now: LocalDateTime = LocalDateTime.now(zoneId)): QuickAddResult {
        val tokens = input.trim()
        val priority = parsePriority(tokens) ?: Priority.P4
        val project = parseProject(tokens)
        var due = parseDue(tokens, now)
        val deadline = parseDeadline(tokens, now)
        val recurrence = parseRecurrence(tokens)

        if (due == null && recurrence != null) {
            val time = parseTime(tokens) ?: LocalTime.of(DEFAULT_TIME_HOUR, 0)
            due = LocalDateTime.of(now.toLocalDate(), time).atZone(zoneId).toInstant().toEpochMilli()
        }

        val reminders = parseReminders(tokens, now, due)

        val title = stripTokens(tokens)
        return QuickAddResult(
            title = title.ifBlank { "Untitled task" },
            dueAt = due,
            deadlineAt = deadline,
            priority = priority,
            projectName = project,
            recurrenceRule = recurrence,
            reminders = reminders
        )
    }

    private fun parsePriority(input: String): Priority? {
        return when {
            input.contains("p1", ignoreCase = true) -> Priority.P1
            input.contains("p2", ignoreCase = true) -> Priority.P2
            input.contains("p3", ignoreCase = true) -> Priority.P3
            input.contains("p4", ignoreCase = true) -> Priority.P4
            else -> null
        }
    }

    private fun parseProject(input: String): String? {
        val match = Regex("#([\\p{L}\\d_ -]+)").find(input)
        return match?.groupValues?.get(1)?.trim()
    }

    private fun parseDue(input: String, now: LocalDateTime): Long? {
        val duePhrase = when {
            input.contains("today", ignoreCase = true) -> "today"
            input.contains("tomorrow", ignoreCase = true) -> "tomorrow"
            input.contains("next week", ignoreCase = true) -> "next week"
            Regex("in\\s+\\d+\\s+days", RegexOption.IGNORE_CASE).containsMatchIn(input) -> "in"
            DayOfWeek.values().any { input.contains(it.name.substring(0, 3), ignoreCase = true) } -> "weekday"
            explicitDateRegex.containsMatchIn(input) -> "explicit"
            else -> null
        } ?: return null

        val time = parseTime(input) ?: LocalTime.of(DEFAULT_TIME_HOUR, 0)
        val date = when (duePhrase) {
            "today" -> now.toLocalDate()
            "tomorrow" -> now.toLocalDate().plusDays(1)
            "next week" -> now.toLocalDate().plusWeeks(1)
            "in" -> {
                val days = Regex("in\\s+(\\d+)\\s+days", RegexOption.IGNORE_CASE)
                    .find(input)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
                now.toLocalDate().plusDays(days)
            }
            "weekday" -> parseWeekday(input, now.toLocalDate())
            else -> parseExplicitDate(input, now.toLocalDate())
        } ?: return null

        return LocalDateTime.of(date, time).atZone(zoneId).toInstant().toEpochMilli()
    }

    private fun parseDeadline(input: String, now: LocalDateTime): Long? {
        val deadlineMatch = Regex("(deadline|by)\\s+([^#]+)", RegexOption.IGNORE_CASE).find(input)
        val braceMatch = Regex("\\{deadline:\\s*([^}]+)\\}", RegexOption.IGNORE_CASE).find(input)
        val phrase = deadlineMatch?.groupValues?.get(2)?.trim()
            ?: braceMatch?.groupValues?.get(1)?.trim()
            ?: return null

        val time = parseTime(phrase) ?: LocalTime.of(DEFAULT_TIME_HOUR, 0)
        val date = when {
            phrase.contains("today", ignoreCase = true) -> now.toLocalDate()
            phrase.contains("tomorrow", ignoreCase = true) -> now.toLocalDate().plusDays(1)
            DayOfWeek.values().any { phrase.contains(it.name.substring(0, 3), ignoreCase = true) } ->
                parseWeekday(phrase, now.toLocalDate())
            explicitDateRegex.containsMatchIn(phrase) -> parseExplicitDate(phrase, now.toLocalDate())
            else -> null
        } ?: return null

        return LocalDateTime.of(date, time).atZone(zoneId).toInstant().toEpochMilli()
    }

    private fun parseReminders(input: String, now: LocalDateTime, dueAt: Long?): List<ReminderSpec> {
        val reminders = mutableListOf<ReminderSpec>()
        val abs = Regex("remind me at\\s+([^#]+)", RegexOption.IGNORE_CASE).find(input)
        if (abs != null) {
            val phrase = abs.groupValues[1].trim()
            val time = parseTime(phrase)
            val date = when {
                phrase.contains("today", ignoreCase = true) -> now.toLocalDate()
                phrase.contains("tomorrow", ignoreCase = true) -> now.toLocalDate().plusDays(1)
                explicitDateRegex.containsMatchIn(phrase) -> parseExplicitDate(phrase, now.toLocalDate())
                else -> now.toLocalDate()
            }
            if (time != null) {
                val instant = LocalDateTime.of(date, time).atZone(zoneId).toInstant().toEpochMilli()
                reminders.add(ReminderSpec.Absolute(instant))
            }
        }

        val rel = Regex("remind me\\s+(\\d+)(m|h)\\s+before", RegexOption.IGNORE_CASE).find(input)
        if (rel != null) {
            val amount = rel.groupValues[1].toInt()
            val unit = rel.groupValues[2].lowercase()
            val minutes = if (unit == "h") amount * 60 else amount
            if (dueAt != null) {
                reminders.add(ReminderSpec.Offset(minutes))
            }
        }

        return reminders
    }

    private fun parseRecurrence(input: String): String? {
        val everyDay = Regex("every\\s*day|everyday", RegexOption.IGNORE_CASE)
        val everyWeekday = Regex("every\\s+weekday", RegexOption.IGNORE_CASE)
        val everyInterval = Regex("every\\s+(\\d+)\\s+(day|week|month|year)s?", RegexOption.IGNORE_CASE)
        val monthlyOn = Regex("every\\s+month\\s+on\\s+the\\s+(\\d+)(st|nd|rd|th)?", RegexOption.IGNORE_CASE)
        val everyNamedDay = Regex("every\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)", RegexOption.IGNORE_CASE)
        val everyBareUnit = Regex("every\\s+(week|month|year)\\b", RegexOption.IGNORE_CASE)

        return when {
            everyWeekday.containsMatchIn(input) -> "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            everyDay.containsMatchIn(input) -> "FREQ=DAILY"
            monthlyOn.containsMatchIn(input) -> {
                val day = monthlyOn.find(input)?.groupValues?.get(1)?.toInt() ?: 1
                "FREQ=MONTHLY;BYMONTHDAY=$day"
            }
            everyNamedDay.containsMatchIn(input) -> {
                val dayName = everyNamedDay.find(input)!!.groupValues[1].uppercase()
                val byDay = when {
                    dayName.startsWith("MON") -> "MO"
                    dayName.startsWith("TUE") -> "TU"
                    dayName.startsWith("WED") -> "WE"
                    dayName.startsWith("THU") -> "TH"
                    dayName.startsWith("FRI") -> "FR"
                    dayName.startsWith("SAT") -> "SA"
                    dayName.startsWith("SUN") -> "SU"
                    else -> "MO"
                }
                "FREQ=WEEKLY;BYDAY=$byDay"
            }
            everyInterval.containsMatchIn(input) -> {
                val match = everyInterval.find(input)!!
                val interval = match.groupValues[1].toInt()
                val unit = match.groupValues[2].uppercase()
                "FREQ=${unit}LY;INTERVAL=$interval"
            }
            everyBareUnit.containsMatchIn(input) -> {
                val unit = everyBareUnit.find(input)!!.groupValues[1].uppercase()
                "FREQ=${unit}LY"
            }
            else -> null
        }
    }

    private fun parseTime(input: String): LocalTime? {
        val match = timeRegex.find(input) ?: return null
        val hourRaw = match.groupValues[1].toInt()
        val minuteRaw = match.groupValues[2].ifBlank { "0" }.toInt()
        val ampm = match.groupValues[3].lowercase()
        val hour = when {
            ampm == "am" && hourRaw == 12 -> 0
            ampm == "pm" && hourRaw < 12 -> hourRaw + 12
            else -> hourRaw
        }
        return LocalTime.of(hour, minuteRaw)
    }

    private fun parseWeekday(input: String, base: LocalDate): LocalDate {
        val map = DayOfWeek.values().associateBy { it.name.substring(0, 3).lowercase() }
        val key = map.keys.firstOrNull { input.lowercase().contains(it) } ?: "mon"
        val target = map[key] ?: DayOfWeek.MONDAY
        return base.with(TemporalAdjusters.nextOrSame(target))
    }

    private fun parseExplicitDate(input: String, base: LocalDate): LocalDate? {
        val match = explicitDateRegex.find(input) ?: return null
        return if (match.groupValues[1].isNotBlank()) {
            val year = match.groupValues[1].toInt()
            val month = match.groupValues[2].toInt()
            val day = match.groupValues[3].toInt()
            LocalDate.of(year, month, day)
        } else {
            val month = match.groupValues[4].toInt()
            val day = match.groupValues[5].toInt()
            val year = match.groupValues[6].ifBlank { base.year.toString() }.toInt()
            val normalizedYear = if (year < 100) 2000 + year else year
            LocalDate.of(normalizedYear, month, day)
        }
    }

    private fun stripTokens(input: String): String {
        return input
            .replace(Regex("#([\\p{L}\\d_ -]+)"), "")
            .replace(Regex("p[1-4]", RegexOption.IGNORE_CASE), "")
            .replace(Regex("today|tomorrow|next week|in\\s+\\d+\\s+days", RegexOption.IGNORE_CASE), "")
            .replace(Regex("deadline\\s+[^#]+", RegexOption.IGNORE_CASE), "")
            .replace(Regex("by\\s+[^#]+", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\{deadline:[^}]+\\}", RegexOption.IGNORE_CASE), "")
            .replace(Regex("remind me[^#]+", RegexOption.IGNORE_CASE), "")
            .replace(Regex("every\\s+[^#]+", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\d{4}-\\d{1,2}-\\d{1,2}"), "")
            .replace(Regex("\\d{1,2}/\\d{1,2}(/\\d{2,4})?"), "")
            .replace(Regex("\\d{1,2}(:\\d{2})?\\s?(am|pm)", RegexOption.IGNORE_CASE), "")
            .trim()
    }
}
