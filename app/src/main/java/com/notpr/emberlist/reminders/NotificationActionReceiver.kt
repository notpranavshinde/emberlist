package com.notpr.emberlist.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.domain.completeTaskAndSubtasks

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
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
            val task = repository.getTask(taskId) ?: run {
                NotificationManagerCompat.from(context).cancel(reminderId.hashCode())
                return@launchAsync
            }
            val reminder = repository.getReminder(reminderId)
            val scheduler = ReminderScheduler(context, repository)
            NotificationManagerCompat.from(context).cancel(reminderId.hashCode())
            when (action) {
                ACTION_COMPLETE -> {
                    scheduler.cancelRemindersForTask(task.id)
                    completeTaskAndSubtasks(repository, task)
                    if (reminder?.ephemeral == true) repository.deleteReminder(reminderId)
                }
                ACTION_SNOOZE -> {
                    scheduler.cancelReminder(reminderId)
                    repository.deleteEphemeralRemindersForTask(task.id)
                    val snoozeReminder = ReminderEntity(
                        id = "snooze-${task.id}",
                        taskId = taskId,
                        type = ReminderType.TIME,
                        timeAt = System.currentTimeMillis() + 10 * 60 * 1000,
                        offsetMinutes = null,
                        locationId = null,
                        locationTriggerType = null,
                        enabled = true,
                        ephemeral = true,
                        createdAt = System.currentTimeMillis()
                    )
                    repository.upsertReminder(snoozeReminder)
                    scheduler.scheduleReminder(task, snoozeReminder)
                }
            }
        }
    }

    companion object {
        const val ACTION_COMPLETE = "com.notpr.emberlist.action.COMPLETE"
        const val ACTION_SNOOZE = "com.notpr.emberlist.action.SNOOZE"

        private const val EXTRA_TASK_ID = "extra_task_id"
        private const val EXTRA_REMINDER_ID = "extra_reminder_id"

        fun intentFor(context: Context, action: String, taskId: String, reminderId: String) =
            android.app.PendingIntent.getBroadcast(
                context,
                (action + taskId + reminderId).hashCode(),
                Intent(context, NotificationActionReceiver::class.java)
                    .setAction(action)
                    .putExtra(EXTRA_TASK_ID, taskId)
                    .putExtra(EXTRA_REMINDER_ID, reminderId),
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
    }
}
