package com.notpr.emberlist

import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskAndSubtasks
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskActionsTest {
    @Test
    fun completeRecurringTaskCreatesNextInstance() = kotlinx.coroutines.runBlocking {
        val repo = FakeTaskRepository()
        val zone = ZoneId.of("UTC")
        val base = LocalDateTime.of(2026, 2, 10, 9, 0).atZone(zone).toInstant().toEpochMilli()
        val task = TaskEntity(
            id = "t1",
            title = "Daily",
            description = "",
            projectId = null,
            sectionId = null,
            priority = Priority.P3,
            dueAt = base,
            allDay = false,
            deadlineAt = null,
            deadlineAllDay = false,
            recurringRule = "FREQ=DAILY",
            deadlineRecurringRule = null,
            status = TaskStatus.OPEN,
            completedAt = null,
            parentTaskId = null,
            locationId = null,
            locationTriggerType = null,
            order = 0,
            createdAt = base,
            updatedAt = base
        )
        repo.upsertTask(task)

        completeTaskWithRecurrence(repo, task) { base }

        val completed = repo.tasks["t1"]
        assertEquals(TaskStatus.COMPLETED, completed?.status)
        val next = repo.tasks.values.firstOrNull { it.id != "t1" }
        assertNotNull(next)
        assertEquals(TaskStatus.OPEN, next?.status)
        assertTrue(next?.dueAt!! > base)
    }

    @Test
    fun completeTaskCompletesSubtasks() = kotlinx.coroutines.runBlocking {
        val repo = FakeTaskRepository()
        val now = System.currentTimeMillis()
        val parent = TaskEntity(
            id = "parent",
            title = "Parent",
            description = "",
            projectId = null,
            sectionId = null,
            priority = Priority.P3,
            dueAt = null,
            allDay = false,
            deadlineAt = null,
            deadlineAllDay = false,
            recurringRule = null,
            deadlineRecurringRule = null,
            status = TaskStatus.OPEN,
            completedAt = null,
            parentTaskId = null,
            locationId = null,
            locationTriggerType = null,
            order = 0,
            createdAt = now,
            updatedAt = now
        )
        val sub1 = parent.copy(id = "sub1", title = "Sub 1", parentTaskId = parent.id)
        val sub2 = parent.copy(id = "sub2", title = "Sub 2", parentTaskId = parent.id)
        repo.upsertTask(parent)
        repo.upsertTask(sub1)
        repo.upsertTask(sub2)

        completeTaskAndSubtasks(repo, parent) { now }

        assertEquals(TaskStatus.COMPLETED, repo.tasks["sub1"]?.status)
        assertEquals(TaskStatus.COMPLETED, repo.tasks["sub2"]?.status)
    }
}
