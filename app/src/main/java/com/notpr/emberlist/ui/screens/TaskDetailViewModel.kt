package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.Priority
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
    private var pendingLogJob: Job? = null
    private var editSessionTaskId: String? = null
    private var editSessionBaseTask: TaskEntity? = null
    private var editSessionBaseReminders: List<ReminderEntity> = emptyList()
    private var pendingLoggedTask: TaskEntity? = null
    private var pendingLoggedReminders: List<ReminderEntity> = emptyList()

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
        val parsed = QuickAddResult(
            title = title,
            dueAt = null,
            deadlineAt = null,
            allDay = false,
            deadlineAllDay = false,
            priority = Priority.P4,
            projectName = null,
            sectionName = null,
            recurrenceRule = null,
            deadlineRecurringRule = null,
            reminders = emptyList()
        )
        addParsedSubtasks(parent, listOf(parsed))
    }

    fun addParsedSubtasks(parent: TaskEntity, entries: List<QuickAddResult>) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val siblings = repository.observeSubtasks(parent.id).first()
            val availableProjects = repository.observeProjects().first()
            val availableSections = repository.observeAllSections().first()
            var nextOrder = (siblings.maxOfOrNull { it.order } ?: 0) + 1
            entries.forEach { entry ->
                val normalized = normalizeParsedResult(entry)
                val projectId = resolveProjectId(normalized.projectName, now, availableProjects) ?: parent.projectId
                val sectionId = if (projectId == parent.projectId) {
                    resolveSectionId(projectId, normalized.sectionName, now, availableSections) ?: parent.sectionId
                } else {
                    resolveSectionId(projectId, normalized.sectionName, now, availableSections)
                }
                val subtask = TaskEntity(
                    id = UUID.randomUUID().toString(),
                    title = normalized.title,
                    description = "",
                    projectId = projectId,
                    sectionId = sectionId,
                    priority = normalized.priority,
                    dueAt = normalized.dueAt,
                    allDay = normalized.allDay,
                    deadlineAt = normalized.deadlineAt,
                    deadlineAllDay = normalized.deadlineAllDay,
                    recurringRule = normalized.recurrenceRule,
                    deadlineRecurringRule = normalized.deadlineRecurringRule,
                    status = TaskStatus.OPEN,
                    completedAt = null,
                    parentTaskId = parent.id,
                    locationId = null,
                    locationTriggerType = null,
                    order = nextOrder++,
                    createdAt = now,
                    updatedAt = now
                )
                repository.upsertTask(subtask)
                val reminderEntities = desiredReminderSpecs(normalized).map { spec ->
                    ReminderEntity(
                        id = UUID.randomUUID().toString(),
                        taskId = subtask.id,
                        type = ReminderType.TIME,
                        timeAt = (spec as? ReminderSpec.Absolute)?.timeAtMillis,
                        offsetMinutes = (spec as? ReminderSpec.Offset)?.minutes,
                        locationId = null,
                        locationTriggerType = null,
                        enabled = true,
                        ephemeral = false,
                        createdAt = now
                    )
                }
                reminderEntities.forEach { repository.upsertReminder(it) }
                reminderScheduler.replaceTaskReminders(subtask, reminderEntities)
                logTaskActivity(
                    repository = repository,
                    type = ActivityType.UPDATED,
                    task = subtask,
                    beforeTask = subtask.copy(parentTaskId = null),
                    details = mapOf("parentTitleAfter" to parent.title)
                )
            }
        }
    }

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            flushPendingActivityInternal()
            val before = task
            val reminders = repository.getRemindersForTask(task.id)
            if (task.status != TaskStatus.COMPLETED) {
                val beforeSubtasks = repository.getSubtasks(task.id)
                reminderScheduler.cancelRemindersForTask(task.id)
                completeTaskAndSubtasks(repository, task)
                undoController.post(
                    UndoEvent(
                        message = "Undo complete: ${task.title}",
                        undo = {
                            repository.upsertTask(before)
                            beforeSubtasks.forEach { repository.upsertTask(it) }
                            reminderScheduler.replaceTaskReminders(before, reminders)
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
                reminderScheduler.replaceTaskReminders(updated, reminders)
                logTaskActivity(repository, ActivityType.UNCOMPLETED, updated)
                undoController.post(
                    UndoEvent(
                        message = "Undo reopen: ${task.title}",
                        undo = {
                            repository.upsertTask(before)
                            reminderScheduler.cancelRemindersForTask(before.id)
                            logTaskActivity(repository, ActivityType.COMPLETED, before)
                        }
                    )
                )
            }
        }
    }

    fun toggleArchive(task: TaskEntity) {
        viewModelScope.launch {
            flushPendingActivityInternal()
            val before = task
            val reminders = repository.getRemindersForTask(task.id)
            val archived = task.status == TaskStatus.OPEN || task.status == TaskStatus.COMPLETED
            val updated = task.copy(
                status = if (archived) TaskStatus.ARCHIVED else TaskStatus.OPEN,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            if (archived) {
                reminderScheduler.cancelRemindersForTask(task.id)
            } else {
                reminderScheduler.replaceTaskReminders(updated, reminders)
            }
            logTaskActivity(repository, if (archived) ActivityType.ARCHIVED else ActivityType.UNARCHIVED, updated)
            undoController.post(
                UndoEvent(
                    message = if (archived) "Undo archive: ${task.title}" else "Undo unarchive: ${task.title}",
                    undo = {
                        repository.upsertTask(before)
                        if (before.status == TaskStatus.ARCHIVED) {
                            reminderScheduler.cancelRemindersForTask(before.id)
                        } else {
                            reminderScheduler.replaceTaskReminders(before, reminders)
                        }
                        logTaskActivity(repository, ActivityType.UPDATED, before, updated)
                    }
                )
            )
        }
    }

    fun completeForever(task: TaskEntity) {
        viewModelScope.launch {
            flushPendingActivityInternal()
            val before = task
            val beforeSubtasks = repository.getSubtasks(task.id)
            val reminders = repository.getRemindersForTask(task.id)
            val withoutRecurrence = task.copy(
                recurringRule = null,
                deadlineRecurringRule = null,
                updatedAt = System.currentTimeMillis()
            )
            reminderScheduler.cancelRemindersForTask(task.id)
            completeTaskAndSubtasks(repository, withoutRecurrence)
            logTaskActivity(repository, ActivityType.UPDATED, withoutRecurrence, before)
            undoController.post(
                UndoEvent(
                    message = "Undo complete forever: ${task.title}",
                    undo = {
                        repository.upsertTask(before)
                        beforeSubtasks.forEach { repository.upsertTask(it) }
                        reminderScheduler.replaceTaskReminders(before, reminders)
                        logTaskActivity(repository, ActivityType.UPDATED, before, withoutRecurrence)
                    }
                )
            )
        }
    }

    suspend fun applyParsedTaskChanges(
        current: TaskEntity,
        description: String,
        parsed: QuickAddResult,
        existingReminders: List<ReminderEntity>,
        availableProjects: List<ProjectEntity>,
        availableSections: List<SectionEntity>
    ): TaskEntity {
        beginEditSessionIfNeeded(current, existingReminders)

        val normalized = normalizeParsedResult(parsed)
        val now = System.currentTimeMillis()
        val projectId = resolveProjectId(normalized.projectName, now, availableProjects)
        val sectionId = resolveSectionId(projectId, normalized.sectionName, now, availableSections)

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

        val taskChanged = updatedTask != current
        if (taskChanged) {
            repository.upsertTask(updatedTask)
        }

        val syncedTask = if (taskChanged) updatedTask else current
        val syncedReminders = syncReminders(
            task = syncedTask,
            existingReminders = existingReminders,
            desiredSpecs = desiredReminderSpecs(normalized)
        )

        if (taskChanged || canonicalReminders(existingReminders) != canonicalReminders(syncedReminders)) {
            pendingLoggedTask = syncedTask
            pendingLoggedReminders = canonicalReminders(syncedReminders)
            schedulePendingActivityFlush()
        }

        return syncedTask
    }

    fun flushPendingActivity() {
        viewModelScope.launch { flushPendingActivityInternal() }
    }

    fun deleteTask(taskId: String) {
        viewModelScope.launch {
            flushPendingActivityInternal()
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
    ): List<ReminderEntity> {
        val existingComparable = canonicalReminders(existingReminders).map { it.toComparable() }
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
                ephemeral = false,
                createdAt = System.currentTimeMillis()
            )
        }
        val desiredComparable = canonicalReminders(newReminders).map { it.toComparable() }

        if (existingComparable == desiredComparable) {
            return canonicalReminders(existingReminders)
        }

        reminderScheduler.cancelRemindersForTask(task.id)
        repository.deleteRemindersForTask(task.id)
        newReminders.forEach { repository.upsertReminder(it) }
        reminderScheduler.replaceTaskReminders(task, newReminders)
        return canonicalReminders(newReminders)
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

    private suspend fun resolveProjectId(
        projectName: String?,
        now: Long,
        availableProjects: List<ProjectEntity>
    ): String? {
        return projectName?.let { name ->
            val existing = availableProjects.firstOrNull {
                it.deletedAt == null && !it.archived && it.name.equals(name, ignoreCase = true)
            } ?: repository.getProjectByName(name)
            if (existing != null) {
                existing.id
            } else if (name.any(Char::isWhitespace)) {
                null
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
    }

    private suspend fun resolveSectionId(
        projectId: String?,
        sectionName: String?,
        now: Long,
        availableSections: List<SectionEntity>
    ): String? {
        if (projectId == null || sectionName.isNullOrBlank()) return null
        val existing = availableSections.firstOrNull {
            it.deletedAt == null &&
                it.projectId == projectId &&
                it.name.equals(sectionName, ignoreCase = true)
        } ?: repository.getSectionByName(projectId, sectionName)
        if (existing != null) return existing.id
        if (sectionName.any(Char::isWhitespace)) return null
        val newSection = SectionEntity(
            id = UUID.randomUUID().toString(),
            projectId = projectId,
            name = sectionName,
            order = 0,
            createdAt = now,
            updatedAt = now
        )
        repository.upsertSection(newSection)
        return newSection.id
    }

    private fun desiredReminderSpecs(parsed: QuickAddResult): List<ReminderSpec> {
        return if (parsed.reminders.isEmpty() && parsed.dueAt != null && !parsed.allDay) {
            listOf(ReminderSpec.Absolute(parsed.dueAt))
        } else {
            parsed.reminders
        }
    }

    private fun beginEditSessionIfNeeded(task: TaskEntity, existingReminders: List<ReminderEntity>) {
        if (editSessionTaskId != task.id) {
            resetPendingActivitySession()
            editSessionTaskId = task.id
        }
        if (editSessionBaseTask == null) {
            editSessionBaseTask = task
            editSessionBaseReminders = canonicalReminders(existingReminders)
        }
    }

    private fun schedulePendingActivityFlush() {
        pendingLogJob?.cancel()
        pendingLogJob = viewModelScope.launch {
            delay(1_000)
            flushPendingActivityInternal()
        }
    }

    private suspend fun flushPendingActivityInternal() {
        pendingLogJob?.cancel()
        pendingLogJob = null
        val beforeTask = editSessionBaseTask ?: return
        val afterTask = pendingLoggedTask ?: return
        val beforeReminders = editSessionBaseReminders
        val afterReminders = pendingLoggedReminders
        if (beforeTask != afterTask || beforeReminders != afterReminders) {
            logTaskActivity(
                repository = repository,
                type = ActivityType.UPDATED,
                task = afterTask,
                beforeTask = beforeTask,
                beforeReminders = beforeReminders,
                afterReminders = afterReminders,
                details = buildActivityDetails(beforeTask, afterTask, beforeReminders, afterReminders)
            )
        }
        editSessionBaseTask = afterTask
        editSessionBaseReminders = afterReminders
        pendingLoggedTask = null
        pendingLoggedReminders = emptyList()
    }

    private fun buildActivityDetails(
        beforeTask: TaskEntity,
        afterTask: TaskEntity,
        beforeReminders: List<ReminderEntity>,
        afterReminders: List<ReminderEntity>
    ): Map<String, String> {
        val details = linkedMapOf<String, String>()
        if (beforeReminders.size == 1 || afterReminders.size == 1) {
            details["reminderCountBefore"] = beforeReminders.size.toString()
            details["reminderCountAfter"] = afterReminders.size.toString()
        }
        return details
    }

    private fun canonicalReminders(reminders: List<ReminderEntity>): List<ReminderEntity> {
        return reminders
            .filter { it.type == ReminderType.TIME }
            .sortedWith(compareBy<ReminderEntity> { it.timeAt ?: Long.MIN_VALUE }.thenBy { it.offsetMinutes ?: Int.MIN_VALUE })
    }

    private fun resetPendingActivitySession() {
        pendingLogJob?.cancel()
        pendingLogJob = null
        editSessionBaseTask = null
        editSessionBaseReminders = emptyList()
        pendingLoggedTask = null
        pendingLoggedReminders = emptyList()
    }

    private data class ComparableReminder(
        val timeAt: Long?,
        val offsetMinutes: Int?
    )

    private fun ReminderEntity.toComparable(): ComparableReminder {
        return ComparableReminder(timeAt = timeAt, offsetMinutes = offsetMinutes)
    }

    override fun onCleared() {
        flushPendingActivity()
        super.onCleared()
    }
}
