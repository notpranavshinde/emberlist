package com.notpr.emberlist

import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.sync.SyncManager
import com.notpr.emberlist.data.sync.SyncPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncManagerTest {
    private val now = 1_710_000_000_000L
    private val manager = SyncManager(
        nowProvider = { now },
        payloadIdFactory = { "merged-payload" }
    )

    @Test
    fun mergeUsesLastWriterWinsForConflictingTaskUpdates() {
        val local = syncPayload(
            tasks = listOf(baseTask(updatedAt = 10L, title = "Local title"))
        )
        val remote = syncPayload(
            tasks = listOf(baseTask(updatedAt = 20L, title = "Remote title"))
        )

        val mergedTask = manager.merge(local, remote).tasks.single()

        assertEquals("Remote title", mergedTask.title)
        assertEquals(20L, mergedTask.updatedAt)
    }

    @Test
    fun tombstoneBeatsOlderLiveRow() {
        val local = syncPayload(
            tasks = listOf(baseTask(updatedAt = 10L))
        )
        val remote = syncPayload(
            tasks = listOf(baseTask(updatedAt = 20L, deletedAt = 20L))
        )

        val mergedTask = manager.merge(local, remote).tasks.single()

        assertEquals(20L, mergedTask.deletedAt)
    }

    @Test
    fun newerLiveRowBeatsOlderTombstoneForSameId() {
        val local = syncPayload(
            tasks = listOf(baseTask(updatedAt = 10L, deletedAt = 10L))
        )
        val remote = syncPayload(
            tasks = listOf(baseTask(updatedAt = 20L, title = "Recreated task"))
        )

        val mergedTask = manager.merge(local, remote).tasks.single()

        assertNull(mergedTask.deletedAt)
        assertEquals("Recreated task", mergedTask.title)
    }

    @Test
    fun missingRowsDoNotImplyDeletion() {
        val local = syncPayload(tasks = listOf(baseTask(id = "task-1", updatedAt = 10L)))
        val remote = syncPayload(tasks = emptyList())

        val merged = manager.merge(local, remote)

        assertEquals(listOf("task-1"), merged.tasks.map(TaskEntity::id))
    }

    @Test
    fun remindersMergeByUpdatedAtAndDropForCompletedTasks() {
        val task = baseTask(updatedAt = 30L, status = TaskStatus.COMPLETED)
        val local = syncPayload(
            tasks = listOf(task),
            reminders = listOf(baseReminder(updatedAt = 10L, createdAt = 100L))
        )
        val remote = syncPayload(
            tasks = listOf(task),
            reminders = listOf(baseReminder(updatedAt = 20L, createdAt = 50L))
        )

        val merged = manager.merge(local, remote)

        assertTrue(merged.reminders.isEmpty())
    }

    @Test
    fun locationsMergeByUpdatedAt() {
        val local = syncPayload(locations = listOf(baseLocation(updatedAt = 10L, label = "Local")))
        val remote = syncPayload(locations = listOf(baseLocation(updatedAt = 20L, label = "Remote")))

        val mergedLocation = manager.merge(local, remote).locations.single()

        assertEquals("Remote", mergedLocation.label)
    }

    @Test
    fun invalidParentAndSectionReferencesAreClearedAfterMerge() {
        val project = baseProject()
        val local = syncPayload(
            projects = listOf(project),
            sections = listOf(baseSection(projectId = project.id)),
            tasks = listOf(
                baseTask(
                    id = "child",
                    projectId = project.id,
                    sectionId = "missing-section",
                    parentTaskId = "missing-parent",
                    updatedAt = 10L
                )
            )
        )

        val mergedTask = manager.merge(local, syncPayload()).tasks.single()

        assertNull(mergedTask.sectionId)
        assertNull(mergedTask.parentTaskId)
        assertEquals(now, mergedTask.updatedAt)
    }

    @Test
    fun deletedProjectsTombstoneDependentSectionsAndClearTaskProjectReferences() {
        val project = baseProject(updatedAt = 20L, deletedAt = 20L)
        val section = baseSection(projectId = project.id, updatedAt = 10L)
        val task = baseTask(projectId = project.id, sectionId = section.id, updatedAt = 10L)
        val merged = manager.merge(
            syncPayload(projects = listOf(project), sections = listOf(section), tasks = listOf(task)),
            syncPayload()
        )

        val mergedSection = merged.sections.single()
        val mergedTask = merged.tasks.single()

        assertNotNull(mergedSection.deletedAt)
        assertNull(mergedTask.projectId)
        assertNull(mergedTask.sectionId)
    }

    @Test
    fun remindersWithMissingLocationAreDroppedOrNormalized() {
        val task = baseTask()
        val timeReminder = baseReminder(
            id = "time-reminder",
            type = ReminderType.TIME,
            locationId = "missing",
            locationTriggerType = LocationTriggerType.ARRIVE
        )
        val locationReminder = baseReminder(
            id = "location-reminder",
            type = ReminderType.LOCATION,
            locationId = "missing",
            locationTriggerType = LocationTriggerType.ARRIVE
        )

        val merged = manager.merge(
            syncPayload(tasks = listOf(task), reminders = listOf(timeReminder, locationReminder)),
            syncPayload()
        )

        assertEquals(1, merged.reminders.size)
        assertEquals("time-reminder", merged.reminders.single().id)
        assertNull(merged.reminders.single().locationId)
    }

    private fun syncPayload(
        projects: List<ProjectEntity> = emptyList(),
        sections: List<SectionEntity> = emptyList(),
        tasks: List<TaskEntity> = emptyList(),
        reminders: List<ReminderEntity> = emptyList(),
        locations: List<LocationEntity> = emptyList()
    ) = SyncPayload(
        deviceId = "device-a",
        payloadId = "payload-a",
        source = "android",
        projects = projects,
        sections = sections,
        tasks = tasks,
        reminders = reminders,
        locations = locations
    )

    private fun baseProject(
        id: String = "project-1",
        updatedAt: Long = 1L,
        deletedAt: Long? = null
    ) = ProjectEntity(
        id = id,
        name = "Project",
        color = "#ffffff",
        favorite = false,
        order = 0,
        archived = false,
        viewPreference = null,
        createdAt = 1L,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private fun baseSection(
        id: String = "section-1",
        projectId: String = "project-1",
        updatedAt: Long = 1L,
        deletedAt: Long? = null
    ) = SectionEntity(
        id = id,
        projectId = projectId,
        name = "Section",
        order = 0,
        createdAt = 1L,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private fun baseTask(
        id: String = "task-1",
        title: String = "Task",
        projectId: String? = null,
        sectionId: String? = null,
        parentTaskId: String? = null,
        locationId: String? = null,
        status: TaskStatus = TaskStatus.OPEN,
        updatedAt: Long = 1L,
        deletedAt: Long? = null
    ) = TaskEntity(
        id = id,
        title = title,
        description = "",
        projectId = projectId,
        sectionId = sectionId,
        priority = Priority.P4,
        dueAt = null,
        allDay = true,
        deadlineAt = null,
        deadlineAllDay = false,
        recurringRule = null,
        deadlineRecurringRule = null,
        status = status,
        completedAt = null,
        parentTaskId = parentTaskId,
        locationId = locationId,
        locationTriggerType = if (locationId == null) null else LocationTriggerType.ARRIVE,
        order = 0,
        createdAt = 1L,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private fun baseReminder(
        id: String = "reminder-1",
        taskId: String = "task-1",
        type: ReminderType = ReminderType.TIME,
        locationId: String? = null,
        locationTriggerType: LocationTriggerType? = null,
        createdAt: Long = 1L,
        updatedAt: Long = 1L
    ) = ReminderEntity(
        id = id,
        taskId = taskId,
        type = type,
        timeAt = 5L,
        offsetMinutes = null,
        locationId = locationId,
        locationTriggerType = locationTriggerType,
        enabled = true,
        ephemeral = false,
        createdAt = createdAt,
        updatedAt = updatedAt
    )

    private fun baseLocation(
        id: String = "location-1",
        label: String = "Location",
        updatedAt: Long = 1L
    ) = LocationEntity(
        id = id,
        label = label,
        address = "123 Test",
        lat = 1.0,
        lng = 2.0,
        radiusMeters = 100,
        createdAt = 1L,
        updatedAt = updatedAt
    )
}
