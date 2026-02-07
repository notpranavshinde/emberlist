package com.notpr.emberlist.domain

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
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
