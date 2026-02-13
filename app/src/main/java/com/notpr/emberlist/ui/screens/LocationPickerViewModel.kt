package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.location.GeofenceScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

class LocationPickerViewModel(
    private val repository: TaskRepository,
    private val geofenceScheduler: GeofenceScheduler
) : ViewModel() {
    fun observeTask(taskId: String): StateFlow<com.notpr.emberlist.data.model.TaskEntity?> =
        repository.observeTask(taskId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun observeLocation(locationId: String): StateFlow<LocationEntity?> =
        repository.observeLocation(locationId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun setTaskLocation(taskId: String, location: LocationEntity, triggerType: LocationTriggerType) {
        viewModelScope.launch {
            val task = repository.getTask(taskId) ?: return@launch
            repository.upsertLocation(location)
            val updated = task.copy(
                locationId = location.id,
                locationTriggerType = triggerType,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            geofenceScheduler.refresh()
        }
    }

    fun addLocationReminder(taskId: String, location: LocationEntity, triggerType: LocationTriggerType) {
        viewModelScope.launch {
            repository.upsertLocation(location)
            val reminder = ReminderEntity(
                id = UUID.randomUUID().toString(),
                taskId = taskId,
                type = ReminderType.LOCATION,
                timeAt = null,
                offsetMinutes = null,
                locationId = location.id,
                locationTriggerType = triggerType,
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
            repository.upsertReminder(reminder)
            geofenceScheduler.refresh()
        }
    }
}
