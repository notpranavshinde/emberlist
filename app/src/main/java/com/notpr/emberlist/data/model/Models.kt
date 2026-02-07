package com.notpr.emberlist.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
enum class ViewPreference { LIST, BOARD }

@Serializable
enum class Priority { P1, P2, P3, P4 }

@Serializable
enum class TaskStatus { OPEN, COMPLETED, ARCHIVED }

@Serializable
enum class ReminderType { TIME }

@Serializable
enum class ActivityType { CREATED, UPDATED, COMPLETED, UNCOMPLETED, ARCHIVED, UNARCHIVED, REMINDER_SCHEDULED }

@Serializable
enum class ObjectType { TASK, PROJECT, SECTION, REMINDER }

@Entity(tableName = "projects")
@Serializable
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val color: String,
    val favorite: Boolean,
    val `order`: Int,
    val archived: Boolean,
    val viewPreference: ViewPreference?,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "sections",
    indices = [Index("projectId")]
)
@Serializable
data class SectionEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val name: String,
    val `order`: Int,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "tasks",
    indices = [
        Index(value = ["status", "dueAt"]),
        Index(value = ["deadlineAt"]),
        Index(value = ["projectId"]),
        Index(value = ["sectionId"]),
        Index(value = ["priority"])
    ]
)
@Serializable
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val description: String,
    val projectId: String?,
    val sectionId: String?,
    val priority: Priority,
    val dueAt: Long?,
    val allDay: Boolean,
    val deadlineAt: Long?,
    val deadlineAllDay: Boolean,
    val recurringRule: String?,
    val deadlineRecurringRule: String?,
    val status: TaskStatus,
    val completedAt: Long?,
    val parentTaskId: String?,
    val `order`: Int,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "reminders",
    indices = [
        Index("taskId"),
        Index("timeAt"),
        Index("enabled")
    ]
)
@Serializable
data class ReminderEntity(
    @PrimaryKey val id: String,
    val taskId: String,
    val type: ReminderType,
    val timeAt: Long?,
    val offsetMinutes: Int?,
    val enabled: Boolean,
    val createdAt: Long
)

@Entity(tableName = "activity_events", indices = [Index("objectId")])
@Serializable
data class ActivityEventEntity(
    @PrimaryKey val id: String,
    val type: ActivityType,
    val objectType: ObjectType,
    val objectId: String,
    val payloadJson: String,
    val createdAt: Long
)
