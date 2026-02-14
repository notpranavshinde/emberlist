package com.notpr.emberlist.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.notpr.emberlist.MainActivity
import com.notpr.emberlist.R

object NotificationHelper {
    const val CHANNEL_ID = "emberlist_reminders"

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Task Reminders",
            NotificationManager.IMPORTANCE_HIGH
        )
        manager.createNotificationChannel(channel)
    }

    fun buildReminderNotification(
        context: Context,
        taskId: String,
        reminderId: String,
        title: String
    ) = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("Reminder")
        .setContentText(title)
        .setContentIntent(openTaskIntent(context, taskId))
        .setAutoCancel(true)
        .addAction(
            0,
            "Complete",
            NotificationActionReceiver.intentFor(context, NotificationActionReceiver.ACTION_COMPLETE, taskId, reminderId)
        )
        .addAction(
            0,
            "Snooze 10m",
            NotificationActionReceiver.intentFor(context, NotificationActionReceiver.ACTION_SNOOZE, taskId, reminderId)
        )
        .addAction(
            0,
            "Open",
            openTaskIntent(context, taskId)
        )

    fun buildLocationNotification(
        context: Context,
        taskId: String,
        reminderId: String,
        title: String,
        message: String
    ) = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle(title)
        .setContentText(message)
        .setContentIntent(openTaskIntent(context, taskId))
        .setAutoCancel(true)
        .addAction(
            0,
            "Complete",
            NotificationActionReceiver.intentFor(context, NotificationActionReceiver.ACTION_COMPLETE, taskId, reminderId)
        )
        .addAction(
            0,
            "Open",
            openTaskIntent(context, taskId)
        )

    private fun openTaskIntent(context: Context, taskId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .putExtra("taskId", taskId)
        return PendingIntent.getActivity(
            context,
            taskId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
