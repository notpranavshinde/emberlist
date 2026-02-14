package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.ui.endOfTodayMillis
import com.notpr.emberlist.ui.startOfTodayMillis
import com.notpr.emberlist.domain.completeTaskAndSubtasks
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.startOfTomorrowMillis
import com.notpr.emberlist.ui.UndoEvent
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.location.GeofenceScheduler
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class TodayViewModel(
    private val repository: TaskRepository,
    private val undoController: UndoController,
    private val geofenceScheduler: GeofenceScheduler
) : ViewModel() {
    val tasks: StateFlow<List<TaskListItem>> = combine(
        repository.observeToday(endOfTodayMillis()),
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

    private fun refreshGeofences() {
        viewModelScope.launch { geofenceScheduler.refresh() }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val subtaskEntities = tasks
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
                refreshGeofences()
            } else {
                repository.upsertTask(
                    task.copy(
                        status = TaskStatus.OPEN,
                        completedAt = null,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                logTaskActivity(repository, ActivityType.UNCOMPLETED, task)
                undoController.post(
                    UndoEvent(
                        message = "Undo reopen: ${task.title}",
                        undo = {
                            repository.upsertTask(before)
                            logTaskActivity(repository, ActivityType.COMPLETED, before)
                        }
                    )
                )
                refreshGeofences()
            }
        }
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
            refreshGeofences()
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
            refreshGeofences()
        }
    }

    fun rescheduleOverdueToDate(date: LocalDate) {
        viewModelScope.launch {
            val zone = ZoneId.systemDefault()
            val startOfToday = startOfTodayMillis(zone)
            val endOfToday = endOfTodayMillis(zone)
            val overdue = repository.observeToday(endOfToday)
                .first()
                .filter { it.dueAt != null && it.dueAt < startOfToday }
            val before = overdue.map { it.copy() }
            overdue.forEach { task ->
                val time = if (!task.allDay) {
                    Instant.ofEpochMilli(task.dueAt!!).atZone(zone).toLocalTime()
                } else {
                    LocalTime.MIDNIGHT
                }
                val newDue = LocalDateTime.of(date, time).atZone(zone).toInstant().toEpochMilli()
                val updated = task.copy(dueAt = newDue, updatedAt = System.currentTimeMillis())
                repository.upsertTask(updated)
                logTaskActivity(repository, ActivityType.UPDATED, updated)
            }
            if (before.isNotEmpty()) {
                undoController.post(
                    UndoEvent(
                        message = "Undo reschedule ${before.size} overdue tasks",
                        undo = { before.forEach { repository.upsertTask(it) } }
                    )
                )
            }
            refreshGeofences()
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
            refreshGeofences()
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
            refreshGeofences()
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
                    undo = {
                        tasks.forEach { repository.upsertTask(it) }
                    }
                )
            )
            refreshGeofences()
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
                    undo = {
                        before.forEach { repository.upsertTask(it) }
                    }
                )
            )
            refreshGeofences()
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
            refreshGeofences()
        }
    }
}
