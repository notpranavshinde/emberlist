package com.notpr.emberlist.data.sync

import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.serialization.Serializable

const val CURRENT_SYNC_SCHEMA_VERSION = 1

@Serializable
data class SyncPayload(
    val schemaVersion: Int = CURRENT_SYNC_SCHEMA_VERSION,
    val exportedAt: Long = 0L,
    val deviceId: String = "",
    val payloadId: String = "",
    val source: String = "android",
    val projects: List<ProjectEntity> = emptyList(),
    val sections: List<SectionEntity> = emptyList(),
    val tasks: List<TaskEntity> = emptyList(),
    val reminders: List<ReminderEntity> = emptyList(),
    val locations: List<LocationEntity> = emptyList()
)
