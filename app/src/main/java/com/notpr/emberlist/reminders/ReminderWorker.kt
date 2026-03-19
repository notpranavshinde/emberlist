package com.notpr.emberlist.reminders

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import com.notpr.emberlist.data.model.TaskStatus

class ReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        val reminderId = inputData.getString(KEY_REMINDER_ID) ?: return Result.failure()

        val db = EmberlistDatabase.build(applicationContext)
        val repository = TaskRepositoryImpl(
            db.projectDao(),
            db.sectionDao(),
            db.taskDao(),
            db.reminderDao(),
            db.activityDao()
        )
        val reminder = repository.getReminder(reminderId)
        val task = repository.getTask(taskId)
        val scheduler = ReminderScheduler(applicationContext, repository)
        if (
            reminder == null ||
            task == null ||
            reminder.taskId != taskId ||
            !reminder.enabled ||
            task.status != TaskStatus.OPEN
        ) {
            scheduler.cancelReminder(reminderId)
            if (reminder?.ephemeral == true || task == null) {
                repository.deleteReminder(reminderId)
            }
            return Result.success()
        }
        val triggerAt = scheduler.computeTriggerAt(task, reminder)
        val now = System.currentTimeMillis()
        if (triggerAt == null || triggerAt < now - MAX_ALLOWED_LATENESS_MS || triggerAt > now + 60_000L) {
            scheduler.cancelReminder(reminderId)
            return Result.success()
        }
        NotificationHelper.ensureChannel(applicationContext)
        val notification = NotificationHelper.buildReminderNotification(
            applicationContext,
            taskId,
            reminderId,
            task.title
        ).build()
        NotificationManagerCompat.from(applicationContext).notify(reminderId.hashCode(), notification)
        if (reminder.ephemeral) {
            repository.deleteReminder(reminderId)
        }
        return Result.success()
    }

    companion object {
        const val KEY_TASK_ID = "key_task_id"
        const val KEY_REMINDER_ID = "key_reminder_id"
        private const val MAX_ALLOWED_LATENESS_MS = 15 * 60 * 1000L
    }
}
