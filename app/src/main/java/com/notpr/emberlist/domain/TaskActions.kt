package com.notpr.emberlist.domain

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.time.Instant
import java.util.UUID

suspend fun completeTaskAndSubtasks(
    repository: TaskRepository,
    task: TaskEntity,
    nowProvider: () -> Long = System::currentTimeMillis
) {
    completeTaskWithRecurrence(repository, task, nowProvider)
    val now = nowProvider()
    val subtasks = repository.getSubtasks(task.id)
    if (subtasks.isEmpty()) return
    subtasks.forEach { subtask ->
        if (subtask.status != TaskStatus.COMPLETED) {
            repository.upsertTask(
                subtask.copy(
                    status = TaskStatus.COMPLETED,
                    completedAt = now,
                    updatedAt = now
                )
            )
            logTaskActivity(repository, ActivityType.COMPLETED, subtask)
        }
    }
}

suspend fun completeTaskWithRecurrence(
    repository: TaskRepository,
    task: TaskEntity,
    nowProvider: () -> Long = System::currentTimeMillis
) {
    val now = nowProvider()
    repository.upsertTask(
        task.copy(
            status = TaskStatus.COMPLETED,
            completedAt = now,
            updatedAt = now
        )
    )
    logTaskActivity(repository, ActivityType.COMPLETED, task)

    val rule = task.recurringRule
    val dueAt = task.dueAt
    val deadlineRule = task.deadlineRecurringRule
    val deadlineAt = task.deadlineAt

    val zone = java.time.ZoneId.systemDefault()
    val nextDue = if (rule != null && dueAt != null) {
        val baseAt = if (now > dueAt) {
            val baseTime = if (task.allDay) java.time.LocalTime.MIDNIGHT else Instant.ofEpochMilli(dueAt).atZone(zone).toLocalTime()
            val baseDate = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
            java.time.LocalDateTime.of(baseDate, baseTime).atZone(zone).toInstant().toEpochMilli()
        } else {
            dueAt
        }
        RecurrenceEngine.nextAt(baseAt, rule, zone, keepTime = !task.allDay)
    } else {
        null
    }

    val nextDeadlineFromRule = if (deadlineRule != null && deadlineAt != null) {
        val baseAt = if (now > deadlineAt) {
            val baseTime = if (task.deadlineAllDay) java.time.LocalTime.MIDNIGHT else Instant.ofEpochMilli(deadlineAt).atZone(zone).toLocalTime()
            val baseDate = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
            java.time.LocalDateTime.of(baseDate, baseTime).atZone(zone).toInstant().toEpochMilli()
        } else {
            deadlineAt
        }
        RecurrenceEngine.nextAt(baseAt, deadlineRule, zone, keepTime = !task.deadlineAllDay)
    } else {
        null
    }

    val deadlineOffset = if (deadlineAt != null && dueAt != null) deadlineAt - dueAt else null
    val nextDeadline = nextDeadlineFromRule
        ?: if (nextDue != null && deadlineOffset != null) nextDue + deadlineOffset else null

    if (nextDue != null || nextDeadline != null) {
        val next = task.copy(
            id = UUID.randomUUID().toString(),
            dueAt = nextDue,
            allDay = if (nextDue != null) task.allDay else false,
            deadlineAt = nextDeadline,
            deadlineAllDay = if (nextDeadline != null) task.deadlineAllDay else false,
            status = TaskStatus.OPEN,
            completedAt = null,
            createdAt = now,
            updatedAt = now
        )
        repository.upsertTask(next)
        logTaskActivity(repository, ActivityType.CREATED, next)
    }
}
