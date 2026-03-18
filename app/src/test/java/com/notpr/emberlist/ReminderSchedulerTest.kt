package com.notpr.emberlist

import android.app.AlarmManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.reminders.ReminderScheduler
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowAlarmManager
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
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

    @Test
    fun scheduleReminderRegistersExactAlarm() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = 1_000_000L)
        val reminder = reminder(timeAt = 2_000_000L)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val scheduledAlarms = shadowOf(alarmManager).scheduledAlarms
        assertEquals(1, scheduledAlarms.size)
        assertEquals(2_000_000L, scheduledAlarms.single().triggerAtTime)
        assertTrue(scheduledAlarms.single().allowWhileIdle)
    }

    @Test
    fun scheduleReminderReplacesExistingAlarmForSameReminder() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = 1_000_000L)
        val reminder = reminder(timeAt = 2_000_000L)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)
        scheduler.scheduleReminder(task, reminder.copy(timeAt = 3_000_000L))

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val scheduledAlarms = shadowOf(alarmManager).scheduledAlarms
        assertEquals(1, scheduledAlarms.size)
        assertEquals(3_000_000L, scheduledAlarms.single().triggerAtTime)
    }

    @Test
    fun cancelReminderRemovesScheduledAlarm() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val scheduler = ReminderScheduler(context, FakeTaskRepository())
        val task = baseTask(dueAt = 1_000_000L)
        val reminder = reminder(timeAt = 2_000_000L)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)
        scheduler.cancelReminder(reminder.id)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
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

    private fun reminder(timeAt: Long? = null, offsetMinutes: Int? = null): ReminderEntity {
        return ReminderEntity(
            id = "r1",
            taskId = "t1",
            type = ReminderType.TIME,
            timeAt = timeAt,
            offsetMinutes = offsetMinutes,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            createdAt = 0L
        )
    }
}
