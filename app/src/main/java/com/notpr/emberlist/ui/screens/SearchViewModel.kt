package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.startOfTomorrowMillis
import com.notpr.emberlist.ui.startOfTodayMillis
import com.notpr.emberlist.ui.UndoBus
import com.notpr.emberlist.ui.UndoEvent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class SearchViewModel(private val repository: TaskRepository) : ViewModel() {
    private val query = MutableStateFlow("")

    val results: StateFlow<List<TaskListItem>> = combine(
        query.flatMapLatest { repository.search(it) },
        repository.observeProjects(),
        repository.observeAllSections()
    ) { tasks, projects, sections ->
        val projectById = projects.associateBy { it.id }
        val sectionById = sections.associateBy { it.id }
        val startOfToday = startOfTodayMillis()
        tasks.map { task ->
            val isOverdue = task.dueAt?.let { it < startOfToday } ?: false
            buildTaskListItem(
                task = task,
                projectById = projectById,
                sectionById = sectionById,
                isOverdue = isOverdue
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val projects = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun updateQuery(value: String) {
        query.value = value
    }

    fun rescheduleTomorrow(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            val zone = ZoneId.systemDefault()
            val newDue = if (task.dueAt != null) {
                Instant.ofEpochMilli(task.dueAt).atZone(zone).plusDays(1).toInstant().toEpochMilli()
            } else {
                startOfTomorrowMillis(zone)
            }
            val allDay = if (task.dueAt == null) true else task.allDay
            val updated = task.copy(dueAt = newDue, allDay = allDay, updatedAt = System.currentTimeMillis())
            repository.upsertTask(updated)
            logTaskActivity(repository, ActivityType.UPDATED, updated)
            UndoBus.post(
                UndoEvent(
                    message = "Task rescheduled",
                    undo = {
                        repository.upsertTask(before)
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
        }
    }

    fun rescheduleToDate(task: TaskEntity, date: LocalDate) {
        viewModelScope.launch {
            val before = task
            val zone = ZoneId.systemDefault()
            val time = if (task.dueAt != null && !task.allDay) {
                Instant.ofEpochMilli(task.dueAt).atZone(zone).toLocalTime()
            } else {
                LocalTime.MIDNIGHT
            }
            val newDue = LocalDateTime.of(date, time).atZone(zone).toInstant().toEpochMilli()
            val allDay = if (task.dueAt == null) true else task.allDay
            val updated = task.copy(dueAt = newDue, allDay = allDay, updatedAt = System.currentTimeMillis())
            repository.upsertTask(updated)
            logTaskActivity(repository, ActivityType.UPDATED, updated)
            UndoBus.post(
                UndoEvent(
                    message = "Task rescheduled",
                    undo = {
                        repository.upsertTask(before)
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
        }
    }

    fun rescheduleTasksToDate(taskIds: List<String>, date: LocalDate) {
        if (taskIds.isEmpty()) return
        viewModelScope.launch {
            val zone = ZoneId.systemDefault()
            val before = taskIds.mapNotNull { repository.observeTask(it).first() }
            taskIds.forEach { id ->
                val task = before.firstOrNull { it.id == id } ?: return@forEach
                val time = if (!task.allDay && task.dueAt != null) {
                    Instant.ofEpochMilli(task.dueAt).atZone(zone).toLocalTime()
                } else {
                    LocalTime.MIDNIGHT
                }
                val newDue = LocalDateTime.of(date, time).atZone(zone).toInstant().toEpochMilli()
                val updated = task.copy(dueAt = newDue, updatedAt = System.currentTimeMillis())
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UPDATED, updated)
            }
            UndoBus.post(
                UndoEvent(
                    message = "Tasks rescheduled",
                    undo = { before.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }

    fun deleteTask(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            deleteTaskWithLog(repository, task)
            UndoBus.post(
                UndoEvent(
                    message = "Task deleted",
                    undo = {
                        repository.upsertTask(before)
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
        }
    }

    fun deleteTasks(taskIds: List<String>) {
        if (taskIds.isEmpty()) return
        viewModelScope.launch {
            val tasks = taskIds.mapNotNull { repository.observeTask(it).first() }
            taskIds.forEach { id ->
                val task = tasks.firstOrNull { it.id == id } ?: return@forEach
                deleteTaskWithLog(repository, task)
            }
            UndoBus.post(
                UndoEvent(
                    message = "Tasks deleted",
                    undo = { tasks.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }

    fun moveTasksToProject(taskIds: List<String>, projectId: String?) {
        if (taskIds.isEmpty()) return
        viewModelScope.launch {
            val before = taskIds.mapNotNull { repository.observeTask(it).first() }
            taskIds.forEach { id ->
                val task = before.firstOrNull { it.id == id } ?: return@forEach
                val updated = task.copy(projectId = projectId, sectionId = null, updatedAt = System.currentTimeMillis())
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UPDATED, updated)
            }
            UndoBus.post(
                UndoEvent(
                    message = "Tasks moved",
                    undo = { before.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }

    fun setPriorityForTasks(taskIds: List<String>, priority: Priority) {
        if (taskIds.isEmpty()) return
        viewModelScope.launch {
            val before = taskIds.mapNotNull { repository.observeTask(it).first() }
            taskIds.forEach { id ->
                val task = before.firstOrNull { it.id == id } ?: return@forEach
                val updated = task.copy(priority = priority, updatedAt = System.currentTimeMillis())
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UPDATED, updated)
            }
            UndoBus.post(
                UndoEvent(
                    message = "Priority updated",
                    undo = { before.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }
}
