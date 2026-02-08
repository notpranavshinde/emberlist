package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.ui.startOfTomorrowMillis
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.domain.RecurrenceEngine
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.ui.components.TaskListItem
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class UpcomingItem(
    val item: TaskListItem,
    val displayDueAt: Long,
    val isPreview: Boolean
)

class UpcomingViewModel(private val repository: TaskRepository) : ViewModel() {
    private val startOfTomorrow = startOfTomorrowMillis()

    val tasks: StateFlow<List<UpcomingItem>> = combine(
        repository.observeUpcoming(startOfTomorrow),
        repository.observeOverdueRecurring(startOfTomorrow),
        repository.observeProjects(),
        repository.observeAllSections()
    ) { upcoming, overdueRecurring, projects, sections ->
        val projectById = projects.associateBy { it.id }
        val sectionById = sections.associateBy { it.id }
        val upcomingItems = upcoming.mapNotNull { task ->
            val dueAt = task.dueAt ?: return@mapNotNull null
            val item = buildTaskListItem(
                task = task,
                projectById = projectById,
                sectionById = sectionById,
                displayDueAt = dueAt,
                isPreview = false
            )
            UpcomingItem(item = item, displayDueAt = dueAt, isPreview = false)
        }

        val previewItems = overdueRecurring.mapNotNull { task ->
            val nextDue = nextUpcomingDue(task, startOfTomorrow) ?: return@mapNotNull null
            val item = buildTaskListItem(
                task = task,
                projectById = projectById,
                sectionById = sectionById,
                displayDueAt = nextDue,
                isPreview = true
            )
            UpcomingItem(item = item, displayDueAt = nextDue, isPreview = true)
        }

        (upcomingItems + previewItems).sortedBy { it.displayDueAt }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            if (task.status != TaskStatus.COMPLETED) {
                completeTaskWithRecurrence(repository, task)
            } else {
                repository.upsertTask(
                    task.copy(
                        status = TaskStatus.OPEN,
                        completedAt = null,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                logActivity(repository, ActivityType.UNCOMPLETED, ObjectType.TASK, task.id)
            }
        }
    }

    fun reschedule(task: TaskEntity, deltaDays: Long) {
        val dueAt = task.dueAt ?: return
        val zone = ZoneId.systemDefault()
        val date = Instant.ofEpochMilli(dueAt).atZone(zone).toLocalDate().plusDays(deltaDays)
        val newDue = date.atStartOfDay(zone).toInstant().toEpochMilli()
        viewModelScope.launch {
            repository.upsertTask(task.copy(dueAt = newDue, updatedAt = System.currentTimeMillis()))
        }
    }

    fun rescheduleTomorrow(task: TaskEntity) {
        reschedule(task, 1)
    }

    fun rescheduleToDate(task: TaskEntity, date: LocalDate) {
        viewModelScope.launch {
            val zone = ZoneId.systemDefault()
            val time = if (task.dueAt != null && !task.allDay) {
                Instant.ofEpochMilli(task.dueAt).atZone(zone).toLocalTime()
            } else {
                LocalTime.MIDNIGHT
            }
            val newDue = LocalDateTime.of(date, time).atZone(zone).toInstant().toEpochMilli()
            val allDay = if (task.dueAt == null) true else task.allDay
            repository.upsertTask(task.copy(dueAt = newDue, allDay = allDay, updatedAt = System.currentTimeMillis()))
        }
    }

    fun deleteTask(task: TaskEntity) {
        viewModelScope.launch {
            repository.deleteTask(task.id)
        }
    }

    private fun nextUpcomingDue(task: TaskEntity, startOfTomorrow: Long): Long? {
        val rule = task.recurringRule ?: return null
        var next = task.dueAt ?: return null
        val zone = ZoneId.systemDefault()
        var guard = 0
        while (next < startOfTomorrow && guard < 120) {
            val computed = RecurrenceEngine.nextAt(next, rule, zone, keepTime = !task.allDay) ?: return null
            if (computed == next) return null
            next = computed
            guard++
        }
        return if (next >= startOfTomorrow) next else null
    }
}
