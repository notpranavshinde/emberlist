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
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.reminders.ReminderScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID

class TaskDetailViewModel(
    private val repository: TaskRepository,
    private val reminderScheduler: ReminderScheduler
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

    fun updateTask(task: TaskEntity) {
        viewModelScope.launch {
            repository.upsertTask(task.copy(updatedAt = System.currentTimeMillis()))
            logTaskActivity(repository, ActivityType.UPDATED, task)
        }
    }

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            if (task.status != TaskStatus.COMPLETED) {
                completeTaskWithRecurrence(repository, task)
            } else {
                val updated = task.copy(
                    status = TaskStatus.OPEN,
                    completedAt = null,
                    updatedAt = System.currentTimeMillis()
                )
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UNCOMPLETED, updated)
            }
        }
    }

    fun toggleArchive(task: TaskEntity) {
        viewModelScope.launch {
            val archived = task.status != TaskStatus.ARCHIVED
            val updated = task.copy(
                status = if (archived) TaskStatus.ARCHIVED else TaskStatus.OPEN,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            logTaskActivity(repository, if (archived) ActivityType.ARCHIVED else ActivityType.UNARCHIVED, updated)
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
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
            repository.upsertReminder(reminder)
            reminderScheduler.scheduleReminder(task, reminder)
            logActivity(repository, ActivityType.REMINDER_SCHEDULED, ObjectType.REMINDER, reminder.id)
        }
    }

    fun toggleReminder(task: TaskEntity, reminder: ReminderEntity) {
        viewModelScope.launch {
            val updated = reminder.copy(enabled = !reminder.enabled)
            repository.upsertReminder(updated)
            if (updated.enabled) {
                reminderScheduler.scheduleReminder(task, updated)
            } else {
                reminderScheduler.cancelReminder(updated.id)
            }
        }
    }

    fun deleteReminder(reminder: ReminderEntity) {
        viewModelScope.launch {
            repository.deleteReminder(reminder.id)
            reminderScheduler.cancelReminder(reminder.id)
        }
    }

    fun deleteTask(taskId: String) {
        viewModelScope.launch {
            val task = repository.observeTask(taskId).first()
            if (task != null) deleteTaskWithLog(repository, task) else repository.deleteTask(taskId)
        }
    }
}
