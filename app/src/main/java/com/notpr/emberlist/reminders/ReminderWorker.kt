package com.notpr.emberlist.reminders

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import kotlinx.coroutines.flow.firstOrNull

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
        val task = repository.observeTask(taskId).firstOrNull() ?: return Result.success()
        NotificationHelper.ensureChannel(applicationContext)
        val notification = NotificationHelper.buildReminderNotification(
            applicationContext,
            taskId,
            reminderId,
            task.title
        ).build()
        NotificationManagerCompat.from(applicationContext).notify(reminderId.hashCode(), notification)
        return Result.success()
    }

    companion object {
        const val KEY_TASK_ID = "key_task_id"
        const val KEY_REMINDER_ID = "key_reminder_id"
    }
}
