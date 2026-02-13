package com.notpr.emberlist.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.data.model.ActivityType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.firstOrNull

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val db = EmberlistDatabase.build(context)
        val repository = TaskRepositoryImpl(
            db.projectDao(),
            db.sectionDao(),
            db.taskDao(),
            db.reminderDao(),
            db.locationDao(),
            db.activityDao()
        )

        CoroutineScope(Dispatchers.IO).launch {
            val task = repository.observeTask(taskId).firstOrNull() ?: return@launch
            when (action) {
                ACTION_COMPLETE -> {
                    val updated = task.copy(status = TaskStatus.COMPLETED, completedAt = System.currentTimeMillis())
                    repository.upsertTask(updated)
                    logTaskActivity(repository, ActivityType.COMPLETED, updated)
                    com.notpr.emberlist.location.GeofenceScheduler(context, repository).refresh()
                }
                ACTION_SNOOZE -> {
                    val scheduler = ReminderScheduler(context, repository)
                    val snoozed = task.copy()
                    val snoozeReminder = com.notpr.emberlist.data.model.ReminderEntity(
                        id = "snooze-$reminderId",
                        taskId = taskId,
                        type = com.notpr.emberlist.data.model.ReminderType.TIME,
                        timeAt = System.currentTimeMillis() + 10 * 60 * 1000,
                        offsetMinutes = null,
                        locationId = null,
                        locationTriggerType = null,
                        enabled = true,
                        createdAt = System.currentTimeMillis()
                    )
                    repository.upsertReminder(snoozeReminder)
                    scheduler.scheduleReminder(snoozed, snoozeReminder)
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
