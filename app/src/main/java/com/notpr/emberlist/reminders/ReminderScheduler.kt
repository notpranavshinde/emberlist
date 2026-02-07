package com.notpr.emberlist.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.TaskEntity
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.firstOrNull

class ReminderScheduler(
    private val context: Context,
    private val repository: TaskRepository
) {
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    suspend fun scheduleForTask(task: TaskEntity, reminders: List<ReminderEntity>) {
        reminders.filter { it.enabled }.forEach { scheduleReminder(task, it) }
    }

    suspend fun scheduleReminder(task: TaskEntity, reminder: ReminderEntity) {
        val triggerAt = computeTriggerAt(task, reminder) ?: return
        val intent = AlarmReceiver.intentFor(context, task.id, reminder.id)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminder.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            enqueueWork(triggerAt, task.id, reminder.id)
            return
        }

        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }

    fun cancelReminder(reminderId: String) {
        val intent = AlarmReceiver.intentFor(context, "", reminderId)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminderId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }

    suspend fun rescheduleAll() {
        val reminders = repository.getEnabledReminders()
        reminders.forEach { reminder ->
            val task = repository.observeTask(reminder.taskId).firstOrNull() ?: return@forEach
            scheduleReminder(task, reminder)
        }
    }

    private fun computeTriggerAt(task: TaskEntity, reminder: ReminderEntity): Long? {
        return reminder.timeAt
            ?: reminder.offsetMinutes?.let { offset ->
                task.dueAt?.minus(TimeUnit.MINUTES.toMillis(offset.toLong()))
            }
    }

    private fun enqueueWork(triggerAt: Long, taskId: String, reminderId: String) {
        val delay = (triggerAt - System.currentTimeMillis()).coerceAtLeast(0)
        val data = Data.Builder()
            .putString(ReminderWorker.KEY_TASK_ID, taskId)
            .putString(ReminderWorker.KEY_REMINDER_ID, reminderId)
            .build()
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(data)
            .build()
        WorkManager.getInstance(context).enqueue(request)
    }
}
