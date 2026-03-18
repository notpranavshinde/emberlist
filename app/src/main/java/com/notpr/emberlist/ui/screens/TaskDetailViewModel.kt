package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskAndSubtasks
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.parsing.QuickAddResult
import com.notpr.emberlist.parsing.ReminderSpec
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.UndoEvent
import java.util.UUID
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TaskDetailViewModel(
    private val repository: TaskRepository,
    private val reminderScheduler: ReminderScheduler,
    private val undoController: UndoController
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

    fun observeAllSections(): StateFlow<List<SectionEntity>> =
        repository.observeAllSections()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeActivity(taskId: String) =
        repository.observeActivity(taskId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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
        }
    }

    fun completeForever(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            val beforeSubtasks = repository.getSubtasks(task.id)
            val withoutRecurrence = task.copy(
                recurringRule = null,
                deadlineRecurringRule = null,
                updatedAt = System.currentTimeMillis()
            )
            completeTaskAndSubtasks(repository, withoutRecurrence)
            logTaskActivity(repository, ActivityType.UPDATED, withoutRecurrence)
            undoController.post(
                UndoEvent(
                    message = "Undo complete forever: ${task.title}",
                    undo = {
                        repository.upsertTask(before)
                        beforeSubtasks.forEach { repository.upsertTask(it) }
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
        }
    }

    fun applyParsedTaskChanges(
        current: TaskEntity,
        description: String,
        parsed: QuickAddResult,
        existingReminders: List<ReminderEntity>
    ) {
        viewModelScope.launch {
            val normalized = normalizeParsedResult(parsed)
            val now = System.currentTimeMillis()
            val projectId = normalized.projectName?.let { name ->
                val existing = repository.getProjectByName(name)
                if (existing != null) {
                    existing.id
                } else {
                    val newProject = ProjectEntity(
                        id = UUID.randomUUID().toString(),
                        name = name,
                        color = "#EE6A3C",
                        favorite = false,
                        order = 0,
                        archived = false,
                        viewPreference = null,
                        createdAt = now,
                        updatedAt = now
                    )
                    repository.upsertProject(newProject)
                    logActivity(repository, ActivityType.CREATED, ObjectType.PROJECT, newProject.id)
                    newProject.id
                }
            }
            val sectionId = if (!normalized.sectionName.isNullOrBlank() && projectId != null) {
                val existing = repository.getSectionByName(projectId, normalized.sectionName)
                if (existing != null) {
                    existing.id
                } else {
                    val newSection = SectionEntity(
                        id = UUID.randomUUID().toString(),
                        projectId = projectId,
                        name = normalized.sectionName,
                        order = 0,
                        createdAt = now,
                        updatedAt = now
                    )
                    repository.upsertSection(newSection)
                    newSection.id
                }
            } else {
                null
            }

            val updatedTask = current.copy(
                title = normalized.title,
                description = description.trim(),
                projectId = projectId,
                sectionId = sectionId,
                priority = normalized.priority,
                dueAt = normalized.dueAt,
                allDay = normalized.allDay,
                deadlineAt = normalized.deadlineAt,
                deadlineAllDay = normalized.deadlineAllDay,
                recurringRule = normalized.recurrenceRule,
                deadlineRecurringRule = normalized.deadlineRecurringRule,
                updatedAt = now
            )

            if (updatedTask != current) {
                repository.upsertTask(updatedTask)
                logTaskActivity(repository, ActivityType.UPDATED, updatedTask)
            }

            syncReminders(updatedTask, existingReminders, desiredReminderSpecs(normalized))
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
            } else {
                repository.deleteTask(taskId)
            }
        }
    }

    private suspend fun syncReminders(
        task: TaskEntity,
        existingReminders: List<ReminderEntity>,
        desiredSpecs: List<ReminderSpec>
    ) {
        val existingComparable = existingReminders
            .filter { it.type == ReminderType.TIME }
            .map { it.toComparable() }
            .sortedBy { "${it.timeAt}:${it.offsetMinutes}" }
        val desiredComparable = desiredSpecs
            .map { it.toComparable() }
            .sortedBy { "${it.timeAt}:${it.offsetMinutes}" }

        if (existingComparable == desiredComparable) return

        existingReminders.forEach { reminder ->
            repository.deleteReminder(reminder.id)
            reminderScheduler.cancelReminder(reminder.id)
        }

        val newReminders = desiredSpecs.map { spec ->
            ReminderEntity(
                id = UUID.randomUUID().toString(),
                taskId = task.id,
                type = ReminderType.TIME,
                timeAt = (spec as? ReminderSpec.Absolute)?.timeAtMillis,
                offsetMinutes = (spec as? ReminderSpec.Offset)?.minutes,
                locationId = null,
                locationTriggerType = null,
                enabled = true,
                createdAt = System.currentTimeMillis()
            )
        }
        newReminders.forEach { repository.upsertReminder(it) }
        reminderScheduler.scheduleForTask(task, newReminders)
    }

    private fun normalizeParsedResult(parsed: QuickAddResult): QuickAddResult {
        var result = parsed
        if (result.dueAt == null && !result.recurrenceRule.isNullOrBlank()) {
            val zone = java.time.ZoneId.systemDefault()
            val startOfDay = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
            result = result.copy(dueAt = startOfDay, allDay = true)
        }
        if (result.deadlineAt == null && !result.deadlineRecurringRule.isNullOrBlank()) {
            val zone = java.time.ZoneId.systemDefault()
            val startOfDay = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
            result = result.copy(deadlineAt = startOfDay, deadlineAllDay = true)
        }
        return result
    }

    private fun desiredReminderSpecs(parsed: QuickAddResult): List<ReminderSpec> {
        return if (parsed.reminders.isEmpty() && parsed.dueAt != null && !parsed.allDay) {
            listOf(ReminderSpec.Absolute(parsed.dueAt))
        } else {
            parsed.reminders
        }
    }

    private data class ComparableReminder(
        val timeAt: Long?,
        val offsetMinutes: Int?
    )

    private fun ReminderEntity.toComparable(): ComparableReminder {
        return ComparableReminder(timeAt = timeAt, offsetMinutes = offsetMinutes)
    }

    private fun ReminderSpec.toComparable(): ComparableReminder {
        return when (this) {
            is ReminderSpec.Absolute -> ComparableReminder(timeAt = timeAtMillis, offsetMinutes = null)
            is ReminderSpec.Offset -> ComparableReminder(timeAt = null, offsetMinutes = minutes)
        }
    }
}
