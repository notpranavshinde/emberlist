package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.domain.completeTaskAndSubtasks
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.UndoEvent
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.location.GeofenceScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID

class TaskDetailViewModel(
    private val repository: TaskRepository,
    private val reminderScheduler: ReminderScheduler,
    private val undoController: UndoController,
    private val geofenceScheduler: GeofenceScheduler
) : ViewModel() {
    fun observeTask(taskId: String): StateFlow<TaskEntity?> = repository.observeTask(taskId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun observeSubtasks(taskId: String): StateFlow<List<TaskEntity>> =
        repository.observeSubtasks(taskId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeReminders(taskId: String): StateFlow<List<ReminderEntity>> =
        repository.observeReminders(taskId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeProjects(): StateFlow<List<ProjectEntity>> =
        repository.observeProjects()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeSections(projectId: String): StateFlow<List<SectionEntity>> =
        repository.observeSections(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeActivity(taskId: String) =
        repository.observeActivity(taskId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeLocation(locationId: String): StateFlow<LocationEntity?> =
        repository.observeLocation(locationId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun updateTask(task: TaskEntity) {
        viewModelScope.launch {
            repository.upsertTask(task.copy(updatedAt = System.currentTimeMillis()))
            logTaskActivity(repository, ActivityType.UPDATED, task)
            geofenceScheduler.refresh()
        }
    }

    fun addSubtask(parent: TaskEntity, title: String) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val siblings = repository.observeSubtasks(parent.id).first()
            val nextOrder = (siblings.maxOfOrNull { it.order } ?: 0) + 1
            val subtask = TaskEntity(
                id = UUID.randomUUID().toString(),
                title = title,
                description = "",
                projectId = parent.projectId,
                sectionId = parent.sectionId,
                priority = com.notpr.emberlist.data.model.Priority.P4,
                dueAt = null,
                allDay = false,
                deadlineAt = null,
                deadlineAllDay = false,
                recurringRule = null,
                deadlineRecurringRule = null,
                status = TaskStatus.OPEN,
                completedAt = null,
                parentTaskId = parent.id,
                locationId = null,
                locationTriggerType = null,
                order = nextOrder,
                createdAt = now,
                updatedAt = now
            )
            repository.upsertTask(subtask)
            logTaskActivity(repository, ActivityType.CREATED, subtask)
        }
    }

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            if (task.status != TaskStatus.COMPLETED) {
                val beforeSubtasks = repository.getSubtasks(task.id)
                completeTaskAndSubtasks(repository, task)
                undoController.post(
                    UndoEvent(
                        message = "Undo complete: ${task.title}",
                        undo = {
                            repository.upsertTask(before)
                            beforeSubtasks.forEach { repository.upsertTask(it) }
                            logTaskActivity(repository, ActivityType.UNCOMPLETED, before)
                        }
                    )
                )
                geofenceScheduler.refresh()
            } else {
                val updated = task.copy(
                    status = TaskStatus.OPEN,
                    completedAt = null,
                    updatedAt = System.currentTimeMillis()
                )
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UNCOMPLETED, updated)
                undoController.post(
                    UndoEvent(
                        message = "Undo reopen: ${task.title}",
                        undo = {
                            repository.upsertTask(before)
                            logTaskActivity(repository, ActivityType.COMPLETED, before)
                        }
                    )
                )
                geofenceScheduler.refresh()
            }
        }
    }

    fun toggleArchive(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            val archived = task.status != TaskStatus.ARCHIVED
            val updated = task.copy(
                status = if (archived) TaskStatus.ARCHIVED else TaskStatus.OPEN,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            logTaskActivity(repository, if (archived) ActivityType.ARCHIVED else ActivityType.UNARCHIVED, updated)
            undoController.post(
                UndoEvent(
                    message = if (archived) "Undo archive: ${task.title}" else "Undo unarchive: ${task.title}",
                    undo = {
                        repository.upsertTask(before)
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
            geofenceScheduler.refresh()
        }
    }

    fun addReminderAt(task: TaskEntity, timeAt: Long) {
        viewModelScope.launch {
            val reminder = ReminderEntity(
                id = UUID.randomUUID().toString(),
                taskId = task.id,
                type = ReminderType.TIME,
                timeAt = timeAt,
                offsetMinutes = null,
                locationId = null,
                locationTriggerType = null,
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
            repository.upsertReminder(reminder)
            reminderScheduler.scheduleReminder(task, reminder)
            logActivity(repository, ActivityType.REMINDER_SCHEDULED, ObjectType.REMINDER, reminder.id)
        }
    }

    fun addReminderOffset(task: TaskEntity, minutes: Int) {
        viewModelScope.launch {
            val reminder = ReminderEntity(
                id = UUID.randomUUID().toString(),
                taskId = task.id,
                type = ReminderType.TIME,
                timeAt = null,
                offsetMinutes = minutes,
                locationId = null,
                locationTriggerType = null,
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
            repository.upsertReminder(reminder)
            reminderScheduler.scheduleReminder(task, reminder)
            logActivity(repository, ActivityType.REMINDER_SCHEDULED, ObjectType.REMINDER, reminder.id)
        }
    }

    fun addLocationReminder(task: TaskEntity, location: LocationEntity, triggerType: LocationTriggerType) {
        viewModelScope.launch {
            repository.upsertLocation(location)
            val reminder = ReminderEntity(
                id = UUID.randomUUID().toString(),
                taskId = task.id,
                type = ReminderType.LOCATION,
                timeAt = null,
                offsetMinutes = null,
                locationId = location.id,
                locationTriggerType = triggerType,
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
            repository.upsertReminder(reminder)
            logActivity(repository, ActivityType.REMINDER_SCHEDULED, ObjectType.REMINDER, reminder.id)
            geofenceScheduler.refresh()
        }
    }

    fun setTaskLocation(task: TaskEntity, location: LocationEntity, triggerType: LocationTriggerType) {
        viewModelScope.launch {
            repository.upsertLocation(location)
            val updated = task.copy(
                locationId = location.id,
                locationTriggerType = triggerType,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            logTaskActivity(repository, ActivityType.UPDATED, updated)
            geofenceScheduler.refresh()
        }
    }

    fun clearTaskLocation(task: TaskEntity) {
        viewModelScope.launch {
            val updated = task.copy(locationId = null, locationTriggerType = null, updatedAt = System.currentTimeMillis())
            repository.upsertTask(updated)
            logTaskActivity(repository, ActivityType.UPDATED, updated)
            geofenceScheduler.refresh()
        }
    }

    suspend fun getLocationsByIds(ids: List<String>): List<LocationEntity> =
        repository.getLocationsByIds(ids)

    fun toggleReminder(task: TaskEntity, reminder: ReminderEntity) {
        viewModelScope.launch {
            val updated = reminder.copy(enabled = !reminder.enabled)
            repository.upsertReminder(updated)
            if (updated.type == ReminderType.LOCATION) {
                geofenceScheduler.refresh()
            } else {
                if (updated.enabled) {
                    reminderScheduler.scheduleReminder(task, updated)
                } else {
                    reminderScheduler.cancelReminder(updated.id)
                }
            }
        }
    }

    fun deleteReminder(reminder: ReminderEntity) {
        viewModelScope.launch {
            repository.deleteReminder(reminder.id)
            if (reminder.type == ReminderType.LOCATION) {
                geofenceScheduler.refresh()
            } else {
                reminderScheduler.cancelReminder(reminder.id)
            }
        }
    }

    fun deleteTask(taskId: String) {
        viewModelScope.launch {
            val task = repository.observeTask(taskId).first()
            if (task != null) {
                deleteTaskWithLog(repository, task)
                undoController.post(
                    UndoEvent(
                        message = "Undo delete: ${task.title}",
                        undo = {
                            repository.upsertTask(task)
                            logTaskActivity(repository, ActivityType.UPDATED, task)
                        }
                    )
                )
                geofenceScheduler.refresh()
            } else {
                repository.deleteTask(taskId)
            }
        }
    }
}
