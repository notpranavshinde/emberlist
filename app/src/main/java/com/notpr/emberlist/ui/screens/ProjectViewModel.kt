package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.deleteTaskWithLog
import com.notpr.emberlist.domain.logTaskActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.ui.UndoBus
import com.notpr.emberlist.ui.UndoEvent
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import com.notpr.emberlist.ui.startOfTomorrowMillis

class ProjectViewModel(private val repository: TaskRepository) : ViewModel() {
    fun observeProject(projectId: String): StateFlow<ProjectEntity?> =
        repository.observeProject(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun observeTasks(projectId: String): StateFlow<List<TaskEntity>> =
        repository.observeProjectTasks(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeSections(projectId: String): StateFlow<List<SectionEntity>> =
        repository.observeSections(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun updateProject(project: ProjectEntity) {
        viewModelScope.launch {
            repository.upsertProject(project.copy(updatedAt = System.currentTimeMillis()))
        }
    }

    fun moveTaskToSection(task: TaskEntity, sectionId: String?, newOrder: Int) {
        viewModelScope.launch {
            val before = task
            val updated = task.copy(
                sectionId = sectionId,
                order = newOrder,
                updatedAt = System.currentTimeMillis()
            )
            repository.upsertTask(updated)
            logTaskActivity(repository, ActivityType.UPDATED, updated)
            UndoBus.post(
                UndoEvent(
                    message = "Task moved",
                    undo = {
                        repository.upsertTask(before)
                        logTaskActivity(repository, ActivityType.UPDATED, before)
                    }
                )
            )
        }
    }

    fun createSection(projectId: String, name: String) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val section = SectionEntity(
                id = UUID.randomUUID().toString(),
                projectId = projectId,
                name = name,
                order = 0,
                createdAt = now,
                updatedAt = now
            )
            repository.upsertSection(section)
        }
    }

    fun renameSection(section: SectionEntity, name: String) {
        viewModelScope.launch {
            repository.upsertSection(section.copy(name = name, updatedAt = System.currentTimeMillis()))
        }
    }

    fun deleteSection(section: SectionEntity) {
        viewModelScope.launch {
            repository.clearTasksInSection(section.id)
            repository.deleteSection(section.id)
        }
    }

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

    fun deleteProject(projectId: String) {
        viewModelScope.launch {
            repository.deleteTasksByProject(projectId)
            repository.deleteSectionsByProject(projectId)
            repository.deleteProject(projectId)
        }
    }
}
