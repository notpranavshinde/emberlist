package com.notpr.emberlist.data.sync

import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

class SyncManager(
    private val nowProvider: () -> Long = System::currentTimeMillis,
    private val payloadIdFactory: () -> String = { UUID.randomUUID().toString() },
    private val source: String = "android"
) {
    private val json = Json { encodeDefaults = true }

    fun merge(local: SyncPayload, remote: SyncPayload): SyncPayload {
        val mergedProjects = mergeEntities(
            local.projects,
            remote.projects,
            idOf = ProjectEntity::id,
            updatedAtOf = ProjectEntity::updatedAt,
            deletedAtOf = ProjectEntity::deletedAt
        )
        val mergedLocations = mergeEntities(
            local.locations,
            remote.locations,
            idOf = LocationEntity::id,
            updatedAtOf = LocationEntity::updatedAt
        )
        val mergedSections = mergeSections(
            mergeEntities(
                local.sections,
                remote.sections,
                idOf = SectionEntity::id,
                updatedAtOf = SectionEntity::updatedAt,
                deletedAtOf = SectionEntity::deletedAt
            ),
            mergedProjects
        )
        val mergedTasks = mergeTasks(
            mergeEntities(
                local.tasks,
                remote.tasks,
                idOf = TaskEntity::id,
                updatedAtOf = TaskEntity::updatedAt,
                deletedAtOf = TaskEntity::deletedAt
            ),
            mergedProjects,
            mergedSections,
            mergedLocations
        )
        val mergedReminders = mergeReminders(
            mergeEntities(
                local.reminders,
                remote.reminders,
                idOf = ReminderEntity::id,
                updatedAtOf = ReminderEntity::updatedAt
            ),
            mergedTasks,
            mergedLocations
        )

        return SyncPayload(
            schemaVersion = maxOf(local.schemaVersion, remote.schemaVersion),
            exportedAt = nowProvider(),
            deviceId = local.deviceId.ifBlank { remote.deviceId },
            payloadId = payloadIdFactory(),
            source = source,
            projects = mergedProjects.sortedBy(ProjectEntity::id),
            sections = mergedSections.sortedBy(SectionEntity::id),
            tasks = mergedTasks.sortedBy(TaskEntity::id),
            reminders = mergedReminders.sortedBy(ReminderEntity::id),
            locations = mergedLocations.sortedBy(LocationEntity::id)
        )
    }

    private fun mergeSections(
        sections: List<SectionEntity>,
        projects: List<ProjectEntity>
    ): List<SectionEntity> {
        val liveProjectIds = projects.filter { it.deletedAt == null }.mapTo(mutableSetOf(), ProjectEntity::id)
        val now = nowProvider()
        return sections.map { section ->
            if (section.deletedAt != null || section.projectId in liveProjectIds) {
                section
            } else {
                section.copy(
                    deletedAt = section.deletedAt ?: now,
                    updatedAt = maxOf(section.updatedAt, now)
                )
            }
        }
    }

    private fun mergeTasks(
        tasks: List<TaskEntity>,
        projects: List<ProjectEntity>,
        sections: List<SectionEntity>,
        locations: List<LocationEntity>
    ): List<TaskEntity> {
        val liveProjectIds = projects.filter { it.deletedAt == null }.mapTo(mutableSetOf(), ProjectEntity::id)
        val liveSections = sections.filter { it.deletedAt == null }.associateBy(SectionEntity::id)
        val liveLocationIds = locations.mapTo(mutableSetOf(), LocationEntity::id)
        val liveTaskIds = tasks.filter { it.deletedAt == null }.mapTo(mutableSetOf(), TaskEntity::id)
        val now = nowProvider()

        return tasks.map { task ->
            if (task.deletedAt != null) return@map task

            var changed = false
            var normalized = task

            if (normalized.projectId != null && normalized.projectId !in liveProjectIds) {
                normalized = normalized.copy(projectId = null, sectionId = null)
                changed = true
            }

            val section = normalized.sectionId?.let(liveSections::get)
            if (normalized.sectionId != null && (section == null || section.projectId != normalized.projectId)) {
                normalized = normalized.copy(sectionId = null)
                changed = true
            }

            if (normalized.parentTaskId != null && (normalized.parentTaskId == normalized.id || normalized.parentTaskId !in liveTaskIds)) {
                normalized = normalized.copy(parentTaskId = null)
                changed = true
            }

            if (normalized.locationId != null && normalized.locationId !in liveLocationIds) {
                normalized = normalized.copy(locationId = null, locationTriggerType = null)
                changed = true
            }

            if (changed) normalized.copy(updatedAt = maxOf(normalized.updatedAt, now)) else normalized
        }
    }

    private fun mergeReminders(
        reminders: List<ReminderEntity>,
        tasks: List<TaskEntity>,
        locations: List<LocationEntity>
    ): List<ReminderEntity> {
        val liveTasks = tasks.filter { it.deletedAt == null }.associateBy(TaskEntity::id)
        val liveLocationIds = locations.mapTo(mutableSetOf(), LocationEntity::id)
        val now = nowProvider()

        return reminders.mapNotNull { reminder ->
            val task = liveTasks[reminder.taskId] ?: return@mapNotNull null
            if (task.status == TaskStatus.COMPLETED || task.status == TaskStatus.ARCHIVED) {
                return@mapNotNull null
            }
            when {
                reminder.locationId == null -> reminder
                reminder.locationId !in liveLocationIds && reminder.type == ReminderType.LOCATION -> null
                reminder.locationId !in liveLocationIds -> reminder.copy(
                    locationId = null,
                    locationTriggerType = null,
                    updatedAt = maxOf(reminder.updatedAt, now)
                )
                else -> reminder
            }
        }
    }

    private fun <T : Any> mergeEntities(
        local: List<T>,
        remote: List<T>,
        idOf: (T) -> String,
        updatedAtOf: (T) -> Long,
        deletedAtOf: ((T) -> Long?)? = null
    ): List<T> {
        val byId = linkedMapOf<String, T>()
        (local + remote).forEach { candidate ->
            val id = idOf(candidate)
            val current = byId[id]
            byId[id] = if (current == null) candidate else chooseWinner(
                left = current,
                right = candidate,
                updatedAtOf = updatedAtOf,
                deletedAtOf = deletedAtOf
            )
        }
        return byId.values.toList()
    }

    private fun <T : Any> chooseWinner(
        left: T,
        right: T,
        updatedAtOf: (T) -> Long,
        deletedAtOf: ((T) -> Long?)? = null
    ): T {
        val leftUpdatedAt = updatedAtOf(left)
        val rightUpdatedAt = updatedAtOf(right)
        if (leftUpdatedAt != rightUpdatedAt) return if (leftUpdatedAt > rightUpdatedAt) left else right

        if (deletedAtOf != null) {
            val leftDeleted = deletedAtOf(left) != null
            val rightDeleted = deletedAtOf(right) != null
            if (leftDeleted != rightDeleted) return if (leftDeleted) left else right
        }

        return if (stableTieBreak(left) >= stableTieBreak(right)) left else right
    }

    private fun stableTieBreak(value: Any): String = when (value) {
        is ProjectEntity -> json.encodeToString(value)
        is SectionEntity -> json.encodeToString(value)
        is TaskEntity -> json.encodeToString(value)
        is ReminderEntity -> json.encodeToString(value)
        is LocationEntity -> json.encodeToString(value)
        else -> value.toString()
    }
}
