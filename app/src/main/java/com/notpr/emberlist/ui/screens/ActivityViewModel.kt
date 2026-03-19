package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.CHANGE_REMINDERS
import com.notpr.emberlist.domain.applyExactTaskUndo
import com.notpr.emberlist.domain.parseActivityChanges
import com.notpr.emberlist.domain.parseActivityPayload
import com.notpr.emberlist.domain.parseReminderSnapshot
import com.notpr.emberlist.reminders.ReminderScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

class ActivityViewModel(
    private val repository: TaskRepository,
    private val reminderScheduler: ReminderScheduler
) : ViewModel() {
    private val json = Json { ignoreUnknownKeys = true }

    val events: StateFlow<List<ActivityEventEntity>> = repository.observeAllActivity()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun canUndo(event: ActivityEventEntity): Boolean {
        val payload = parsePayload(event) ?: return false
        return when (event.type) {
            ActivityType.CREATED -> true
            ActivityType.DELETED -> payload["taskJson"] != null
            ActivityType.UPDATED -> payload["beforeTaskJson"] != null
            ActivityType.COMPLETED,
            ActivityType.UNCOMPLETED,
            ActivityType.ARCHIVED,
            ActivityType.UNARCHIVED -> true
            else -> false
        }
    }

    fun undo(event: ActivityEventEntity) {
        viewModelScope.launch {
            val payload = parsePayload(event) ?: return@launch
            when (event.type) {
                ActivityType.CREATED -> repository.deleteTask(event.objectId)
                ActivityType.DELETED -> payload["taskJson"]?.jsonPrimitive?.contentOrNull?.let {
                    repository.upsertTask(json.decodeFromString<TaskEntity>(it))
                }
                ActivityType.UPDATED -> undoTaskUpdate(event, payload)
                ActivityType.COMPLETED -> restoreTaskStatus(event, payload, TaskStatus.OPEN, clearCompletedAt = true)
                ActivityType.UNCOMPLETED -> restoreTaskStatus(event, payload, TaskStatus.COMPLETED, clearCompletedAt = false)
                ActivityType.ARCHIVED -> restoreTaskStatus(event, payload, TaskStatus.OPEN, clearCompletedAt = false)
                ActivityType.UNARCHIVED -> restoreTaskStatus(event, payload, TaskStatus.ARCHIVED, clearCompletedAt = false)
                else -> Unit
            }
        }
    }

    private suspend fun undoTaskUpdate(event: ActivityEventEntity, payload: JsonObject) {
        val before = payload["beforeTaskJson"]?.jsonPrimitive?.contentOrNull?.let {
            json.decodeFromString<TaskEntity>(it)
        } ?: return
        val current = repository.observeTask(event.objectId).first() ?: return
        val changes = parseActivityChanges(payload)
        val restored = applyExactTaskUndo(current, before, changes)
        repository.upsertTask(restored)
        if (CHANGE_REMINDERS in changes) {
            restoreReminders(restored, parseReminderSnapshot(payload, "beforeRemindersJson"))
        }
    }

    private suspend fun restoreTaskStatus(
        event: ActivityEventEntity,
        payload: JsonObject,
        fallbackStatus: TaskStatus,
        clearCompletedAt: Boolean
    ) {
        val before = payload["beforeTaskJson"]?.jsonPrimitive?.contentOrNull
        if (before != null) {
            repository.upsertTask(json.decodeFromString<TaskEntity>(before))
            return
        }
        val current = repository.observeTask(event.objectId).first()
        val payloadTask = payload["taskJson"]?.jsonPrimitive?.contentOrNull?.let { json.decodeFromString<TaskEntity>(it) }
        val base = current ?: payloadTask ?: return
        repository.upsertTask(
            base.copy(
                status = fallbackStatus,
                completedAt = if (clearCompletedAt) null else base.completedAt,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    private suspend fun restoreReminders(task: TaskEntity, reminders: List<ReminderEntity>) {
        repository.observeReminders(task.id).first().forEach { reminder ->
            repository.deleteReminder(reminder.id)
            reminderScheduler.cancelReminder(reminder.id)
        }
        reminders.forEach { repository.upsertReminder(it) }
        reminderScheduler.scheduleForTask(task, reminders)
    }

    private fun parsePayload(event: ActivityEventEntity): JsonObject? = parseActivityPayload(event.payloadJson)
}
