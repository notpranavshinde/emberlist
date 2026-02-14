package com.notpr.emberlist

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

class FakeTaskRepository : TaskRepository {
    val tasks = LinkedHashMap<String, TaskEntity>()
    val reminders = LinkedHashMap<String, ReminderEntity>()
    val activities = ArrayList<ActivityEventEntity>()
    val locations = LinkedHashMap<String, LocationEntity>()

    override fun observeInbox(): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeToday(endOfDay: Long): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeUpcoming(startOfTomorrow: Long): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeOverdueRecurring(startOfTomorrow: Long): Flow<List<TaskEntity>> = flowOf(emptyList())
    override fun observeProjects(): Flow<List<ProjectEntity>> = flowOf(emptyList())
    override fun observeProjectTaskCounts() = flowOf(emptyList<com.notpr.emberlist.data.model.ProjectTaskCount>())
    override fun observeProject(projectId: String): Flow<ProjectEntity?> = flowOf(null)
    override suspend fun getProjectByName(name: String): ProjectEntity? = null
    override suspend fun getSectionByName(projectId: String, name: String): SectionEntity? = null
    override fun observeProjectTasks(projectId: String): Flow<List<TaskEntity>> = flowOf(emptyList())
    override fun observeSections(projectId: String): Flow<List<SectionEntity>> = flowOf(emptyList())
    override fun observeAllSections(): Flow<List<SectionEntity>> = flowOf(emptyList())
    override fun observeTask(taskId: String): Flow<TaskEntity?> = flowOf(tasks[taskId])
    override suspend fun getTask(taskId: String): TaskEntity? = tasks[taskId]
    override fun observeSubtasks(parentId: String): Flow<List<TaskEntity>> =
        flowOf(tasks.values.filter { it.parentTaskId == parentId })
    override fun observeSubtasksForParents(parentIds: List<String>): Flow<List<TaskEntity>> =
        flowOf(tasks.values.filter { it.parentTaskId in parentIds })
    override fun observeReminders(taskId: String): Flow<List<ReminderEntity>> =
        flowOf(reminders.values.filter { it.taskId == taskId })
    override suspend fun getReminder(reminderId: String): ReminderEntity? = reminders[reminderId]
    override fun observeActivity(objectId: String): Flow<List<ActivityEventEntity>> = flowOf(activities)
    override fun observeAllActivity(): Flow<List<ActivityEventEntity>> = flowOf(activities)
    override fun search(query: String): Flow<List<TaskEntity>> = flowOf(emptyList())
    override fun observeLocation(locationId: String): Flow<LocationEntity?> = flowOf(locations[locationId])

    override suspend fun upsertProject(project: ProjectEntity) {}
    override suspend fun upsertSection(section: SectionEntity) {}
    override suspend fun deleteSection(sectionId: String) {}
    override suspend fun deleteProject(projectId: String) {}
    override suspend fun deleteTasksByProject(projectId: String) {}
    override suspend fun deleteSectionsByProject(projectId: String) {}

    override suspend fun upsertTask(task: TaskEntity) {
        tasks[task.id] = task
    }

    override suspend fun deleteTask(taskId: String) {
        tasks.remove(taskId)
    }

    override suspend fun getSubtasks(parentId: String): List<TaskEntity> =
        tasks.values.filter { it.parentTaskId == parentId }

    override suspend fun clearCompletedTasks() {}
    override suspend fun clearTasksInSection(sectionId: String) {}

    override suspend fun upsertReminder(reminder: ReminderEntity) {
        reminders[reminder.id] = reminder
    }

    override suspend fun deleteReminder(reminderId: String) {
        reminders.remove(reminderId)
    }

    override suspend fun insertActivity(event: ActivityEventEntity) {
        activities.add(event)
    }

    override suspend fun upsertLocation(location: LocationEntity) {
        locations[location.id] = location
    }

    override suspend fun deleteLocation(locationId: String) {
        locations.remove(locationId)
    }

    override suspend fun getLocation(locationId: String): LocationEntity? = locations[locationId]
    override suspend fun getLocationsByIds(ids: List<String>): List<LocationEntity> =
        ids.mapNotNull { locations[it] }

    override suspend fun getEnabledReminders(): List<ReminderEntity> =
        reminders.values.filter { it.enabled }

    override suspend fun getEnabledLocationReminders(): List<ReminderEntity> =
        reminders.values.filter { it.enabled && it.type == com.notpr.emberlist.data.model.ReminderType.LOCATION }

    override suspend fun getOpenTasksWithLocation(): List<TaskEntity> =
        tasks.values.filter { it.locationId != null }
}
