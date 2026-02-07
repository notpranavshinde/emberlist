package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.ui.startOfTomorrowMillis
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class UpcomingViewModel(private val repository: TaskRepository) : ViewModel() {
    val tasks: StateFlow<List<TaskEntity>> = repository.observeUpcoming(startOfTomorrowMillis())
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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
}
