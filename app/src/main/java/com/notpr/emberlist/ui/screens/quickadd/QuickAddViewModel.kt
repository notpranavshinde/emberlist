package com.notpr.emberlist.ui.screens.quickadd

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.ReminderSpec
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

class QuickAddViewModel(
    private val repository: TaskRepository,
    private val reminderScheduler: ReminderScheduler
) : ViewModel() {
    private val parser = QuickAddParser()
    private val _input = MutableStateFlow("")
    val input: StateFlow<String> = _input

    private val _parsed = MutableStateFlow(parser.parse(""))
    val parsed = _parsed

    private val dueOverride = MutableStateFlow<Long?>(null)
    private val deadlineOverride = MutableStateFlow<Long?>(null)
    private val allDayOverride = MutableStateFlow<Boolean?>(null)
    private val deadlineAllDayOverride = MutableStateFlow<Boolean?>(null)
    private val priorityOverride = MutableStateFlow<Priority?>(null)
    private val projectOverride = MutableStateFlow<String?>(null)
    private val recurrenceOverride = MutableStateFlow<String?>(null)
    private val deadlineRecurrenceOverride = MutableStateFlow<String?>(null)
    private val remindersOverride = MutableStateFlow<List<ReminderSpec>?>(null)

    val projects = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun updateInput(text: String) {
        _input.value = text
        _parsed.value = mergeOverrides(parser.parse(text))
    }

    fun setDueOverride(value: Long?) {
        dueOverride.value = value
        allDayOverride.value = false
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setDeadlineOverride(value: Long?) {
        deadlineOverride.value = value
        deadlineAllDayOverride.value = false
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setPriorityOverride(value: Priority?) {
        priorityOverride.value = value
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setProjectOverride(value: String?) {
        projectOverride.value = value
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setRecurrenceOverride(value: String?) {
        recurrenceOverride.value = value
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setDeadlineRecurrenceOverride(value: String?) {
        deadlineRecurrenceOverride.value = value
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun setRemindersOverride(value: List<ReminderSpec>?) {
        remindersOverride.value = value
        _parsed.value = mergeOverrides(_parsed.value)
    }

    fun saveTask(onSaved: () -> Unit) {
        var result = _parsed.value
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val taskId = UUID.randomUUID().toString()
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
            val projectId = result.projectName?.let { name ->
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
            val task = TaskEntity(
                id = taskId,
                title = result.title,
                description = "",
                projectId = projectId,
                sectionId = null,
                priority = result.priority,
                dueAt = result.dueAt,
                allDay = result.allDay,
                deadlineAt = result.deadlineAt,
                deadlineAllDay = result.deadlineAllDay,
                recurringRule = result.recurrenceRule,
                deadlineRecurringRule = result.deadlineRecurringRule,
                status = TaskStatus.OPEN,
                completedAt = null,
                parentTaskId = null,
                order = 0,
                createdAt = now,
                updatedAt = now
            )
            repository.upsertTask(task)
            logActivity(repository, ActivityType.CREATED, ObjectType.TASK, taskId)

            val reminderEntities = result.reminders.map { spec ->
                val reminder = ReminderEntity(
                    id = UUID.randomUUID().toString(),
                    taskId = taskId,
                    type = ReminderType.TIME,
                    timeAt = (spec as? ReminderSpec.Absolute)?.timeAtMillis,
                    offsetMinutes = (spec as? ReminderSpec.Offset)?.minutes,
                    enabled = true,
                    createdAt = now
                )
                repository.upsertReminder(reminder)
                reminder
            }
            reminderScheduler.scheduleForTask(task, reminderEntities)
            onSaved()
        }
    }

    private fun mergeOverrides(base: com.notpr.emberlist.parsing.QuickAddResult): com.notpr.emberlist.parsing.QuickAddResult {
        return base.copy(
            dueAt = dueOverride.value ?: base.dueAt,
            deadlineAt = deadlineOverride.value ?: base.deadlineAt,
            allDay = allDayOverride.value ?: base.allDay,
            deadlineAllDay = deadlineAllDayOverride.value ?: base.deadlineAllDay,
            priority = priorityOverride.value ?: base.priority,
            projectName = projectOverride.value ?: base.projectName,
            recurrenceRule = recurrenceOverride.value ?: base.recurrenceRule,
            deadlineRecurringRule = deadlineRecurrenceOverride.value ?: base.deadlineRecurringRule,
            reminders = remindersOverride.value ?: base.reminders
        )
    }
}
