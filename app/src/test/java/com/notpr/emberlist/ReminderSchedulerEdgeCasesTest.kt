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
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class ReminderSchedulerEdgeCasesTest {

    @Test
    fun scheduleReminderDoesNotScheduleWhenTaskIsCompleted() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L, status = TaskStatus.COMPLETED)
        val reminder = reminder(timeAt = now + 2_000_000L)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun scheduleReminderDoesNotScheduleWhenTaskIsArchived() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L, status = TaskStatus.ARCHIVED)
        val reminder = reminder(timeAt = now + 2_000_000L)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun scheduleReminderDoesNotScheduleWhenReminderIsDisabled() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L)
        val reminder = reminder(timeAt = now + 2_000_000L, enabled = false)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleForTask(task, listOf(reminder))

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun scheduleForTaskSchedulesMultipleEnabledReminders() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L)
        val reminder1 = reminder(id = "r1", timeAt = now + 2_000_000L)
        val reminder2 = reminder(id = "r2", timeAt = now + 3_000_000L)
        val reminder3 = reminder(id = "r3", timeAt = now + 4_000_000L, enabled = false)
        repository.tasks[task.id] = task
        repository.reminders[reminder1.id] = reminder1
        repository.reminders[reminder2.id] = reminder2
        repository.reminders[reminder3.id] = reminder3
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleForTask(task, listOf(reminder1, reminder2, reminder3))

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertEquals(2, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun replaceTaskRemindersCancelsOldAndSchedulesNew() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L)
        val oldReminder = reminder(id = "r1", timeAt = now + 2_000_000L)
        val newReminder = reminder(id = "r2", timeAt = now + 5_000_000L)
        repository.tasks[task.id] = task
        repository.reminders[oldReminder.id] = oldReminder
        repository.reminders[newReminder.id] = newReminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, oldReminder)
        scheduler.replaceTaskReminders(task, listOf(newReminder))

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
        assertEquals(now + 5_000_000L, shadowOf(alarmManager).scheduledAlarms.single().triggerAtTime)
    }

    @Test
    fun cancelReminderWithNonExistentAlarmDoesNotCrash() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)

        scheduler.cancelReminder("nonexistent")
    }

    @Test
    fun cancelRemindersForTaskWithNoRemindersDoesNotCrash() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val task = baseTask(dueAt = null)
        repository.tasks[task.id] = task

        scheduler.cancelRemindersForTask(task.id)
    }

    @Test
    fun rescheduleAllHandlesDeletedTask() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val reminder = reminder(timeAt = now + 2_000_000L)
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.rescheduleAll()

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
        assertTrue(repository.reminders.isEmpty())
    }

    @Test
    fun rescheduleAllHandlesCompletedTask() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L, status = TaskStatus.COMPLETED)
        val reminder = reminder(timeAt = now + 2_000_000L, ephemeral = false)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.rescheduleAll()

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
        assertTrue(repository.reminders.containsKey(reminder.id))
    }

    @Test
    fun rescheduleAllHandlesCompletedTaskWithEphemeralReminder() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now + 1_000_000L, status = TaskStatus.COMPLETED)
        val reminder = reminder(timeAt = now + 2_000_000L, ephemeral = true)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.rescheduleAll()

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
        assertTrue(repository.reminders.isEmpty())
    }

    @Test
    fun computeTriggerWithLocationReminderReturnsNull() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val task = baseTask(dueAt = 1_000_000L)
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.LOCATION,
            timeAt = null,
            offsetMinutes = null,
            locationId = "loc1",
            locationTriggerType = com.notpr.emberlist.data.model.LocationTriggerType.ARRIVE,
            enabled = true,
            ephemeral = false,
            createdAt = 0L
        )

        val trigger = scheduler.computeTriggerAt(task, reminder)

        assertEquals(null, trigger)
    }

    @Test
    fun scheduleReminderWithPastTriggerDoesNotSchedule() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val pastTime = System.currentTimeMillis() - 60_000L
        val task = baseTask(dueAt = pastTime)
        val reminder = reminder(timeAt = pastTime)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun scheduleReminderWithExactTimeNowDoesNotSchedule() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val now = System.currentTimeMillis()
        val task = baseTask(dueAt = now)
        val reminder = reminder(timeAt = now)
        repository.tasks[task.id] = task
        repository.reminders[reminder.id] = reminder
        ShadowAlarmManager.setCanScheduleExactAlarms(true)

        scheduler.scheduleReminder(task, reminder)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun dismissNotificationWithNonExistentNotificationDoesNotCrash() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)

        scheduler.dismissNotification("nonexistent")
    }

    @Test
    fun scheduleReminderWithOffsetAndNoDueDate() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val task = baseTask(dueAt = null)
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = null,
            offsetMinutes = 30,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            ephemeral = false,
            createdAt = 0L
        )

        val trigger = scheduler.computeTriggerAt(task, reminder)

        assertEquals(null, trigger)
    }

    private fun baseTask(dueAt: Long?, status: TaskStatus = TaskStatus.OPEN): TaskEntity {
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
            status = status,
            completedAt = null,
            parentTaskId = null,
            locationId = null,
            locationTriggerType = null,
            order = 0,
            createdAt = 0L,
            updatedAt = 0L
        )
    }

    private fun reminder(
        id: String = "r1",
        timeAt: Long? = null,
        offsetMinutes: Int? = null,
        enabled: Boolean = true,
        ephemeral: Boolean = false
    ): ReminderEntity {
        return ReminderEntity(
            id = id,
            taskId = "t1",
            type = ReminderType.TIME,
            timeAt = timeAt,
            offsetMinutes = offsetMinutes,
            locationId = null,
            locationTriggerType = null,
            enabled = enabled,
            ephemeral = ephemeral,
            createdAt = 0L
        )
    }
}
