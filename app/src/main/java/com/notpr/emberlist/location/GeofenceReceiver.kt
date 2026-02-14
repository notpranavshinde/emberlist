package com.notpr.emberlist.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import com.notpr.emberlist.reminders.NotificationHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val trigger = event.triggeringGeofences?.firstOrNull() ?: return
        val transition = event.geofenceTransition

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
            val requestId = trigger.requestId
            val taskId = requestId.substringAfter("task:", "")
            val reminderId = requestId.substringAfter("reminder:", "")
            val task = when {
                requestId.startsWith("task:") -> repository.getTask(taskId)
                requestId.startsWith("reminder:") -> {
                    val reminder = repository.getReminder(reminderId) ?: return@launch
                    repository.getTask(reminder.taskId)
                }
                else -> null
            } ?: return@launch
            if (task.status != com.notpr.emberlist.data.model.TaskStatus.OPEN) return@launch

            val locationId = when {
                requestId.startsWith("task:") -> task.locationId
                requestId.startsWith("reminder:") -> repository.getReminder(reminderId)?.locationId
                else -> null
            }
            val location = locationId?.let { repository.getLocation(it) }
            val locationLabel = location?.label ?: "Location"

            val actionText = when (transition) {
                Geofence.GEOFENCE_TRANSITION_ENTER -> "Arrived at"
                Geofence.GEOFENCE_TRANSITION_EXIT -> "Left"
                else -> "Location"
            }

            NotificationHelper.ensureChannel(context)
            val notification = NotificationHelper.buildLocationNotification(
                context = context,
                taskId = task.id,
                reminderId = requestId,
                title = task.title,
                message = "$actionText $locationLabel"
            ).build()
            NotificationManagerCompat.from(context).notify(requestId.hashCode(), notification)
        }
    }
}
