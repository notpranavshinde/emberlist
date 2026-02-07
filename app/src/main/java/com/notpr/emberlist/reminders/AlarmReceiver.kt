package com.notpr.emberlist.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.firstOrNull

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val db = EmberlistDatabase.build(context)
        val repository = TaskRepositoryImpl(
            db.projectDao(),
            db.sectionDao(),
            db.taskDao(),
            db.reminderDao(),
            db.activityDao()
        )

        CoroutineScope(Dispatchers.IO).launch {
            val task = repository.observeTask(taskId).firstOrNull() ?: return@launch
            NotificationHelper.ensureChannel(context)
            val notification = NotificationHelper.buildReminderNotification(
                context,
                taskId,
                reminderId,
                task.title
            ).build()
            NotificationManagerCompat.from(context).notify(reminderId.hashCode(), notification)
        }
    }

    companion object {
        private const val EXTRA_TASK_ID = "extra_task_id"
        private const val EXTRA_REMINDER_ID = "extra_reminder_id"

        fun intentFor(context: Context, taskId: String, reminderId: String): Intent {
            return Intent(context, AlarmReceiver::class.java)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_REMINDER_ID, reminderId)
        }
    }
}
