package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.ui.UndoBus
import com.notpr.emberlist.ui.UndoEvent
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.startOfTomorrowMillis
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class InboxViewModel(private val repository: TaskRepository) : ViewModel() {
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

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            val before = task
            if (task.status != TaskStatus.COMPLETED) {
                completeTaskWithRecurrence(repository, task)
                UndoBus.post(
                    UndoEvent(
                        message = "Task completed",
                        undo = {
                            repository.upsertTask(before)
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
                UndoBus.post(
                    UndoEvent(
                        message = "Task marked open",
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
}
