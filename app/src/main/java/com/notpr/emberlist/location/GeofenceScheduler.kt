package com.notpr.emberlist.location

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class GeofenceScheduler(
    private val context: Context,
    private val repository: TaskRepository
) {
    private val geofencingClient: GeofencingClient = LocationServices.getGeofencingClient(context)
    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)

    suspend fun refresh() = withContext(Dispatchers.IO) {
        if (!hasForegroundLocationPermission()) {
            removeAll()
            return@withContext
        }
        if (!hasBackgroundLocationPermission()) {
            removeAll()
            return@withContext
        }

        val tasks = repository.getOpenTasksWithLocation()
        val locationReminders = repository.getEnabledLocationReminders()
            .filter { it.type == ReminderType.LOCATION }

        if (tasks.isEmpty() && locationReminders.isEmpty()) {
            removeAll()
            return@withContext
        }

        val locationIds = (tasks.mapNotNull { it.locationId } + locationReminders.mapNotNull { it.locationId })
            .distinct()
        val locations = repository.getLocationsByIds(locationIds).associateBy { it.id }

        val remindersWithTask = locationReminders.mapNotNull { reminder ->
            val task = repository.getTask(reminder.taskId) ?: return@mapNotNull null
            if (task.status != TaskStatus.OPEN) return@mapNotNull null
            reminder to task
        }

        val triggers = mutableListOf<LocationTrigger>()
        tasks.forEach { task ->
            val loc = task.locationId?.let { locations[it] } ?: return@forEach
            val triggerType = task.locationTriggerType ?: LocationTriggerType.ARRIVE
            triggers += LocationTrigger(
                id = "task:${task.id}",
                taskId = task.id,
                reminderId = null,
                dueAt = task.dueAt,
                lat = loc.lat,
                lng = loc.lng,
                radiusMeters = loc.radiusMeters,
                triggerType = triggerType
            )
        }
        remindersWithTask.forEach { (reminder, task) ->
            val loc = reminder.locationId?.let { locations[it] } ?: return@forEach
            val triggerType = reminder.locationTriggerType ?: LocationTriggerType.ARRIVE
            triggers += LocationTrigger(
                id = "reminder:${reminder.id}",
                taskId = task.id,
                reminderId = reminder.id,
                dueAt = task.dueAt,
                lat = loc.lat,
                lng = loc.lng,
                radiusMeters = loc.radiusMeters,
                triggerType = triggerType
            )
        }

        if (triggers.isEmpty()) {
            removeAll()
            return@withContext
        }

        val lastLocation = getLastLocation()
        val ranked = rankTriggers(triggers, lastLocation)
        val selected = ranked.take(MAX_GEOFENCES)

        removeAll()
        addGeofences(selected)
    }

    @SuppressLint("MissingPermission")
    private fun addGeofences(triggers: List<LocationTrigger>) {
        if (triggers.isEmpty()) return
        val geofences = triggers.map { trigger ->
            Geofence.Builder()
                .setRequestId(trigger.id)
                .setCircularRegion(trigger.lat, trigger.lng, trigger.radiusMeters.toFloat())
                .setTransitionTypes(
                    if (trigger.triggerType == LocationTriggerType.ARRIVE) {
                        Geofence.GEOFENCE_TRANSITION_ENTER
                    } else {
                        Geofence.GEOFENCE_TRANSITION_EXIT
                    }
                )
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .build()
        }

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(geofences)
            .build()

        try {
            Tasks.await(geofencingClient.addGeofences(request, geofencePendingIntent()))
        } catch (_: Exception) {
            // Ignore; permission or services unavailable.
        }
    }

    private fun removeAll() {
        try {
            Tasks.await(geofencingClient.removeGeofences(geofencePendingIntent()))
        } catch (_: Exception) {
            // Ignore.
        }
    }

    private fun geofencePendingIntent(): PendingIntent {
        val intent = Intent(context, GeofenceReceiver::class.java)
        return PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun hasForegroundLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun hasBackgroundLocationPermission(): Boolean {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    private fun getLastLocation(): Location? {
        return try {
            Tasks.await(fusedLocationClient.lastLocation, 2, TimeUnit.SECONDS)
        } catch (_: Exception) {
            null
        }
    }

    internal data class LocationTrigger(
        val id: String,
        val taskId: String,
        val reminderId: String?,
        val dueAt: Long?,
        val lat: Double,
        val lng: Double,
        val radiusMeters: Int,
        val triggerType: LocationTriggerType
    )

    companion object {
        private const val MAX_GEOFENCES = 100
    }
}

internal fun rankTriggers(
    triggers: List<GeofenceScheduler.LocationTrigger>,
    lastLocation: Location?
): List<GeofenceScheduler.LocationTrigger> {
    return triggers.sortedWith(compareBy<GeofenceScheduler.LocationTrigger> { trigger ->
        priorityGroup(trigger, lastLocation)
    }.thenBy { trigger ->
        trigger.dueAt ?: Long.MAX_VALUE
    }.thenBy { trigger ->
        distanceMeters(lastLocation, trigger) ?: Double.MAX_VALUE
    })
}

internal fun priorityGroup(
    trigger: GeofenceScheduler.LocationTrigger,
    lastLocation: Location?
): Int {
    val hasDue = trigger.dueAt != null
    val hasDistance = distanceMeters(lastLocation, trigger) != null
    return when {
        hasDue && hasDistance -> 0
        hasDue -> 1
        hasDistance -> 2
        else -> 3
    }
}

internal fun distanceMeters(
    lastLocation: Location?,
    trigger: GeofenceScheduler.LocationTrigger
): Double? {
    if (lastLocation == null) return null
    val results = FloatArray(1)
    Location.distanceBetween(
        lastLocation.latitude,
        lastLocation.longitude,
        trigger.lat,
        trigger.lng,
        results
    )
    return results.first().toDouble()
}
