package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.reminders.ReminderScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReminderSchedulerTest {
    @Test
    fun computeTriggerUsesAbsoluteTime() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = 1_000_000L)
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = 2_000_000L,
            offsetMinutes = null,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            createdAt = 0L
        )
        assertEquals(2_000_000L, scheduler.computeTriggerAt(task, reminder))
    }

    @Test
    fun computeTriggerUsesOffset() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = 3_600_000L)
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = null,
            offsetMinutes = 30,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            createdAt = 0L
        )
        assertEquals(1_800_000L, scheduler.computeTriggerAt(task, reminder))
    }

    @Test
    fun computeTriggerReturnsNullWhenNoDueForOffset() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = null)
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = null,
            offsetMinutes = 10,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            createdAt = 0L
        )
        assertNull(scheduler.computeTriggerAt(task, reminder))
    }

    private fun baseTask(dueAt: Long?): TaskEntity {
        return TaskEntity(
            id = "t1",
            title = "Task",
            description = "",
            projectId = null,
            sectionId = null,
            priority = Priority.P3,
            dueAt = dueAt,
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
            createdAt = 0L,
            updatedAt = 0L
        )
    }
}
