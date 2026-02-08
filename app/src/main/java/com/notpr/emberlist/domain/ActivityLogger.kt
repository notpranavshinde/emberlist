package com.notpr.emberlist.domain

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

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
    task: TaskEntity
) {
    val payload = buildJsonObject {
        put("title", task.title)
        put("priority", task.priority.name)
        put("allDay", task.allDay)
        task.dueAt?.let { put("dueAt", it) }
        put("deadlineAllDay", task.deadlineAllDay)
        task.deadlineAt?.let { put("deadlineAt", it) }
        task.projectId?.let { put("projectId", it) }
        task.sectionId?.let { put("sectionId", it) }
    }
    logActivity(
        repository = repository,
        type = type,
        objectType = ObjectType.TASK,
        objectId = task.id,
        payloadJson = payload.toString()
    )
}

suspend fun deleteTaskWithLog(
    repository: TaskRepository,
    task: TaskEntity
) {
    logTaskActivity(repository, ActivityType.DELETED, task)
    repository.deleteTask(task.id)
}
