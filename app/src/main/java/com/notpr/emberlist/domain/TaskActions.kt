package com.notpr.emberlist.domain

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.util.UUID

suspend fun completeTaskWithRecurrence(repository: TaskRepository, task: TaskEntity) {
    val now = System.currentTimeMillis()
    repository.upsertTask(
        task.copy(
            status = TaskStatus.COMPLETED,
            completedAt = now,
            updatedAt = now
        )
    )
    logActivity(repository, ActivityType.COMPLETED, ObjectType.TASK, task.id)

    val rule = task.recurringRule
    val dueAt = task.dueAt
    val deadlineRule = task.deadlineRecurringRule
    val deadlineAt = task.deadlineAt

    val zone = java.time.ZoneId.systemDefault()
    val nextDue = if (rule != null && dueAt != null) {
        RecurrenceEngine.nextAt(dueAt, rule, zone, keepTime = !task.allDay)
    } else {
        null
    }

    val nextDeadlineFromRule = if (deadlineRule != null && deadlineAt != null) {
        RecurrenceEngine.nextAt(deadlineAt, deadlineRule, zone, keepTime = !task.deadlineAllDay)
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
    }
}
