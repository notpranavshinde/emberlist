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
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.UndoEvent
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class SearchViewModel(
    private val repository: TaskRepository,
    private val undoController: UndoController
) : ViewModel() {
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

    @OptIn(ExperimentalCoroutinesApi::class)
    private val subtaskEntities = results
        .map { list -> list.map { it.task.id } }
        .distinctUntilChanged()
        .flatMapLatest { ids ->
            if (ids.isEmpty()) flowOf(emptyList()) else repository.observeSubtasksForParents(ids)
        }

    val subtasks: StateFlow<List<TaskListItem>> = combine(
        subtaskEntities,
        repository.observeProjects(),
        repository.observeAllSections()
    ) { subtaskEntities, projects, sections ->
        val projectById = projects.associateBy { it.id }
        val sectionById = sections.associateBy { it.id }
        subtaskEntities.map { task ->
            buildTaskListItem(
                task = task,
                projectById = projectById,
                sectionById = sectionById
            ).copy(isSubtask = true, indentLevel = 1)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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
            undoController.post(
                UndoEvent(
                    message = "Undo reschedule: ${task.title}",
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
            undoController.post(
                UndoEvent(
                    message = "Undo reschedule: ${task.title}",
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
            undoController.post(
                UndoEvent(
                    message = "Undo reschedule ${before.size} tasks",
                    undo = { before.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }

    fun deleteTask(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            deleteTaskWithLog(repository, task)
            undoController.post(
                UndoEvent(
                    message = "Undo delete: ${task.title}",
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
            undoController.post(
                UndoEvent(
                    message = "Undo delete ${tasks.size} tasks",
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
            undoController.post(
                UndoEvent(
                    message = "Undo move ${before.size} tasks",
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
            undoController.post(
                UndoEvent(
                    message = "Undo priority change",
                    undo = { before.forEach { repository.upsertTask(it) } }
                )
            )
        }
    }
}
