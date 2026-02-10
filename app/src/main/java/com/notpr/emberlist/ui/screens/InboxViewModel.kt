package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskAndSubtasks
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.ui.UndoEvent
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.startOfTomorrowMillis
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class InboxViewModel(
    private val repository: TaskRepository,
    private val undoController: UndoController
) : ViewModel() {
    val tasks: StateFlow<List<TaskListItem>> = combine(
        repository.observeInbox(),
        repository.observeProjects(),
        repository.observeAllSections()
    ) { tasks, projects, sections ->
        val projectById = projects.associateBy { it.id }
        val sectionById = sections.associateBy { it.id }
        tasks.map { task ->
            buildTaskListItem(
                task = task,
                projectById = projectById,
                sectionById = sectionById
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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
}
