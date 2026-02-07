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
    if (rule != null && dueAt != null) {
        val nextDue = RecurrenceEngine.nextDue(dueAt, rule) ?: return
        val next = task.copy(
            id = UUID.randomUUID().toString(),
            dueAt = nextDue,
            status = TaskStatus.OPEN,
            completedAt = null,
            createdAt = now,
            updatedAt = now
        )
        repository.upsertTask(next)
    }
}
