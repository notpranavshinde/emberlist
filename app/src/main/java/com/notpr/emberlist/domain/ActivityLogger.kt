package com.notpr.emberlist.domain

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID

private val activityJson = Json { encodeDefaults = true; ignoreUnknownKeys = true }

internal const val CHANGE_TITLE = "title"
internal const val CHANGE_NOTES = "notes"
internal const val CHANGE_PRIORITY = "priority"
internal const val CHANGE_DUE = "due"
internal const val CHANGE_DEADLINE = "deadline"
internal const val CHANGE_PROJECT = "project"
internal const val CHANGE_SECTION = "section"
internal const val CHANGE_RECURRENCE = "recurrence"
internal const val CHANGE_DEADLINE_RECURRENCE = "deadline_recurrence"
internal const val CHANGE_REMINDERS = "reminders"
internal const val CHANGE_PARENT_TASK = "parent_task"

suspend fun logActivity(
    repository: TaskRepository,
    type: ActivityType,
    objectType: ObjectType,
    objectId: String,
    payloadJson: String = "{}"
) {
    val event = ActivityEventEntity(
        id = UUID.randomUUID().toString(),
        type = type,
        objectType = objectType,
        objectId = objectId,
        payloadJson = payloadJson,
        createdAt = System.currentTimeMillis()
    )
    repository.insertActivity(event)
}

suspend fun logTaskActivity(
    repository: TaskRepository,
    type: ActivityType,
    task: TaskEntity,
    beforeTask: TaskEntity? = null,
    beforeReminders: List<ReminderEntity> = emptyList(),
    afterReminders: List<ReminderEntity> = emptyList(),
    details: Map<String, String> = emptyMap()
) {
    logActivity(
        repository = repository,
        type = type,
        objectType = ObjectType.TASK,
        objectId = task.id,
        payloadJson = buildTaskActivityPayload(
            type = type,
            task = task,
            beforeTask = beforeTask,
            beforeReminders = beforeReminders,
            afterReminders = afterReminders,
            details = details
        ).toString()
    )
}

internal fun buildTaskActivityPayload(
    type: ActivityType,
    task: TaskEntity,
    beforeTask: TaskEntity? = null,
    beforeReminders: List<ReminderEntity> = emptyList(),
    afterReminders: List<ReminderEntity> = emptyList(),
    details: Map<String, String> = emptyMap()
): JsonObject {
    val canonicalBeforeReminders = canonicalReminders(beforeReminders)
    val canonicalAfterReminders = canonicalReminders(afterReminders)
    val changes = if (type == ActivityType.UPDATED && beforeTask != null) {
        taskChangeTypes(beforeTask, task, canonicalBeforeReminders, canonicalAfterReminders)
    } else {
        emptyList()
    }
    return buildJsonObject {
        put("title", task.title)
        put("taskJson", activityJson.encodeToString(task))
        beforeTask?.let { put("beforeTaskJson", activityJson.encodeToString(it)) }
        put("priority", task.priority.name)
        put("allDay", task.allDay)
        task.dueAt?.let { put("dueAt", it) }
        put("deadlineAllDay", task.deadlineAllDay)
        task.deadlineAt?.let { put("deadlineAt", it) }
        task.projectId?.let { put("projectId", it) }
        task.sectionId?.let { put("sectionId", it) }
        if (type == ActivityType.UPDATED && beforeTask != null) {
            put("afterTaskJson", activityJson.encodeToString(task))
            put("summary", summarizeTaskChanges(changes, task.title, details))
            putJsonArray("changes") {
                changes.forEach { add(JsonPrimitive(it)) }
            }
            put("beforeRemindersJson", activityJson.encodeToString(canonicalBeforeReminders))
            put("afterRemindersJson", activityJson.encodeToString(canonicalAfterReminders))
            put("reminderCountBefore", canonicalBeforeReminders.size)
            put("reminderCountAfter", canonicalAfterReminders.size)
            if (beforeTask.title != task.title) {
                put("titleBefore", beforeTask.title)
                put("titleAfter", task.title)
            }
            if (beforeTask.parentTaskId != task.parentTaskId) {
                beforeTask.parentTaskId?.let { put("parentTaskIdBefore", it) }
                task.parentTaskId?.let { put("parentTaskIdAfter", it) }
            }
            details.forEach { (key, value) -> put(key, value) }
        }
    }
}

internal fun taskChangeTypes(
    beforeTask: TaskEntity,
    afterTask: TaskEntity,
    beforeReminders: List<ReminderEntity> = emptyList(),
    afterReminders: List<ReminderEntity> = emptyList()
): List<String> {
    val changes = mutableListOf<String>()
    if (beforeTask.title != afterTask.title) changes += CHANGE_TITLE
    if (beforeTask.description != afterTask.description) changes += CHANGE_NOTES
    if (beforeTask.priority != afterTask.priority) changes += CHANGE_PRIORITY
    if (beforeTask.dueAt != afterTask.dueAt || beforeTask.allDay != afterTask.allDay) changes += CHANGE_DUE
    if (beforeTask.deadlineAt != afterTask.deadlineAt || beforeTask.deadlineAllDay != afterTask.deadlineAllDay) changes += CHANGE_DEADLINE
    if (beforeTask.projectId != afterTask.projectId) changes += CHANGE_PROJECT
    if (beforeTask.sectionId != afterTask.sectionId) changes += CHANGE_SECTION
    if (beforeTask.recurringRule != afterTask.recurringRule) changes += CHANGE_RECURRENCE
    if (beforeTask.deadlineRecurringRule != afterTask.deadlineRecurringRule) changes += CHANGE_DEADLINE_RECURRENCE
    if (beforeTask.parentTaskId != afterTask.parentTaskId) changes += CHANGE_PARENT_TASK
    if (canonicalReminders(beforeReminders) != canonicalReminders(afterReminders)) changes += CHANGE_REMINDERS
    return changes
}

internal fun summarizeTaskChanges(
    changes: List<String>,
    title: String,
    details: Map<String, String> = emptyMap()
): String {
    if (changes.isEmpty()) return "Updated task: $title"
    if (changes == listOf(CHANGE_PARENT_TASK)) {
        val parentTitle = details["parentTitleAfter"]
        if (!parentTitle.isNullOrBlank()) return "Made $title a subtask of $parentTitle"
    }
    val phrases = changes.map { changePhrase(it, details) }
    val combined = combinePhrases(phrases)
    return "${combined.replaceFirstChar { it.uppercase() }} for: $title"
}

fun formatActivityLabel(event: ActivityEventEntity): String {
    val payload = parseActivityPayload(event.payloadJson)
    return formatActivityLabel(event.type, event.objectType, payload)
}

internal fun formatActivityLabel(
    type: ActivityType,
    objectType: ObjectType,
    payload: JsonObject?
): String {
    val title = payload?.get("title")?.jsonPrimitive?.contentOrNull()
    if (objectType == ObjectType.TASK && type == ActivityType.UPDATED) {
        val summary = payload?.get("summary")?.jsonPrimitive?.contentOrNull()
        if (!summary.isNullOrBlank()) return summary
    }
    if (objectType == ObjectType.TASK && !title.isNullOrBlank()) {
        val action = when (type) {
            ActivityType.CREATED -> "Created"
            ActivityType.UPDATED -> "Updated task"
            ActivityType.COMPLETED -> "Completed"
            ActivityType.UNCOMPLETED -> "Reopened"
            ActivityType.ARCHIVED -> "Archived"
            ActivityType.UNARCHIVED -> "Unarchived"
            ActivityType.DELETED -> "Deleted"
            ActivityType.REMINDER_SCHEDULED -> "Scheduled reminder for"
        }
        return "$action: $title"
    }
    val prefix = when (objectType) {
        ObjectType.TASK -> "Task"
        ObjectType.PROJECT -> "Project"
        ObjectType.SECTION -> "Section"
        ObjectType.REMINDER -> "Reminder"
    }
    val action = when (type) {
        ActivityType.CREATED -> "created"
        ActivityType.UPDATED -> "updated"
        ActivityType.COMPLETED -> "completed"
        ActivityType.UNCOMPLETED -> "reopened"
        ActivityType.ARCHIVED -> "archived"
        ActivityType.UNARCHIVED -> "unarchived"
        ActivityType.DELETED -> "deleted"
        ActivityType.REMINDER_SCHEDULED -> "reminder scheduled"
    }
    return "$prefix $action"
}

internal fun applyExactTaskUndo(
    current: TaskEntity,
    beforeTask: TaskEntity,
    changes: Set<String>
): TaskEntity {
    var restored = current
    if (CHANGE_TITLE in changes) restored = restored.copy(title = beforeTask.title)
    if (CHANGE_NOTES in changes) restored = restored.copy(description = beforeTask.description)
    if (CHANGE_PRIORITY in changes) restored = restored.copy(priority = beforeTask.priority)
    if (CHANGE_DUE in changes) restored = restored.copy(dueAt = beforeTask.dueAt, allDay = beforeTask.allDay)
    if (CHANGE_DEADLINE in changes) restored = restored.copy(deadlineAt = beforeTask.deadlineAt, deadlineAllDay = beforeTask.deadlineAllDay)
    if (CHANGE_PROJECT in changes) restored = restored.copy(projectId = beforeTask.projectId)
    if (CHANGE_SECTION in changes) restored = restored.copy(sectionId = beforeTask.sectionId)
    if (CHANGE_RECURRENCE in changes) restored = restored.copy(recurringRule = beforeTask.recurringRule)
    if (CHANGE_DEADLINE_RECURRENCE in changes) restored = restored.copy(deadlineRecurringRule = beforeTask.deadlineRecurringRule)
    if (CHANGE_PARENT_TASK in changes) restored = restored.copy(parentTaskId = beforeTask.parentTaskId)
    return restored.copy(updatedAt = System.currentTimeMillis())
}

internal fun parseActivityPayload(payloadJson: String): JsonObject? = runCatching {
    activityJson.parseToJsonElement(payloadJson).jsonObject
}.getOrNull()

internal fun parseActivityChanges(payload: JsonObject): Set<String> {
    val raw = payload["changes"]?.jsonArray ?: return emptySet()
    return raw.mapNotNull { it.jsonPrimitive.contentOrNull() }.toSet()
}

internal fun parseReminderSnapshot(payload: JsonObject, key: String): List<ReminderEntity> {
    val encoded = payload[key]?.jsonPrimitive?.contentOrNull() ?: return emptyList()
    return runCatching {
        canonicalReminders(activityJson.decodeFromString<List<ReminderEntity>>(encoded))
    }.getOrDefault(emptyList())
}

private fun canonicalReminders(reminders: List<ReminderEntity>): List<ReminderEntity> {
    return reminders
        .filter { it.type.name == "TIME" }
        .sortedWith(
            compareBy<ReminderEntity> { it.timeAt ?: Long.MIN_VALUE }
                .thenBy { it.offsetMinutes ?: Int.MIN_VALUE }
                .thenBy { it.id }
        )
}

private fun changePhrase(change: String, details: Map<String, String>): String {
    return when (change) {
        CHANGE_TITLE -> "renamed"
        CHANGE_NOTES -> "updated notes"
        CHANGE_PRIORITY -> "changed priority"
        CHANGE_DUE -> "changed due date"
        CHANGE_DEADLINE -> "changed deadline"
        CHANGE_PROJECT -> "changed project"
        CHANGE_SECTION -> "changed section"
        CHANGE_RECURRENCE -> "changed recurrence"
        CHANGE_DEADLINE_RECURRENCE -> "changed deadline recurrence"
        CHANGE_REMINDERS -> if ((details["reminderCountBefore"] ?: details["reminderCountAfter"]) == "1") "changed reminder" else "changed reminders"
        CHANGE_PARENT_TASK -> details["parentTitleAfter"]?.let { "made a subtask of $it" } ?: "changed parent task"
        else -> "updated task"
    }
}

private fun combinePhrases(phrases: List<String>): String {
    return when (phrases.size) {
        0 -> "updated task"
        1 -> phrases.first()
        2 -> "${phrases[0]} and ${phrases[1]}"
        else -> phrases.dropLast(1).joinToString(", ") + ", and ${phrases.last()}"
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNull(): String? = runCatching { content }.getOrNull()

suspend fun deleteTaskWithLog(
    repository: TaskRepository,
    task: TaskEntity
) {
    logTaskActivity(repository, ActivityType.DELETED, task)
    repository.deleteTask(task.id)
}
