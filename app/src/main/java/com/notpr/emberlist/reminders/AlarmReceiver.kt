package com.notpr.emberlist.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.flow.firstOrNull

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val db = EmberlistDatabase.getInstance(context)
        val repository = TaskRepositoryImpl(
            db.projectDao(),
            db.sectionDao(),
            db.taskDao(),
            db.reminderDao(),
            db.activityDao()
        )

        launchAsync {
            val reminder = repository.getReminder(reminderId)
            val task = repository.observeTask(taskId).firstOrNull()
            val scheduler = ReminderScheduler(context, repository)
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
                return@launchAsync
            }
            val triggerAt = scheduler.computeTriggerAt(task, reminder)
            val now = System.currentTimeMillis()
            if (triggerAt == null || triggerAt < now - MAX_ALLOWED_LATENESS_MS || triggerAt > now + 60_000L) {
                scheduler.cancelReminder(reminderId)
                return@launchAsync
            }
            NotificationHelper.ensureChannel(context)
            val notification = NotificationHelper.buildReminderNotification(
                context,
                taskId,
                reminderId,
                task.title
            ).build()
            androidx.core.app.NotificationManagerCompat.from(context).notify(reminderId.hashCode(), notification)
            if (reminder.ephemeral) {
                repository.deleteReminder(reminder.id)
            }
        }
    }

    companion object {
        private const val EXTRA_TASK_ID = "extra_task_id"
        private const val EXTRA_REMINDER_ID = "extra_reminder_id"
        private const val MAX_ALLOWED_LATENESS_MS = 15 * 60 * 1000L

        fun intentFor(context: Context, taskId: String, reminderId: String): Intent {
            return Intent(context, AlarmReceiver::class.java)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_REMINDER_ID, reminderId)
        }
    }
}
