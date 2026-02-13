package com.notpr.emberlist.data

import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.coroutines.flow.Flow

interface TaskRepository {
    fun observeInbox(): Flow<List<TaskEntity>>
    fun observeToday(endOfDay: Long): Flow<List<TaskEntity>>
    fun observeUpcoming(startOfTomorrow: Long): Flow<List<TaskEntity>>
    fun observeOverdueRecurring(startOfTomorrow: Long): Flow<List<TaskEntity>>
    fun observeProjects(): Flow<List<ProjectEntity>>
    fun observeProjectTaskCounts(): Flow<List<com.notpr.emberlist.data.model.ProjectTaskCount>>
    fun observeProject(projectId: String): Flow<ProjectEntity?>
    suspend fun getProjectByName(name: String): ProjectEntity?
    suspend fun getSectionByName(projectId: String, name: String): SectionEntity?
    fun observeProjectTasks(projectId: String): Flow<List<TaskEntity>>
    fun observeSections(projectId: String): Flow<List<SectionEntity>>
    fun observeAllSections(): Flow<List<SectionEntity>>
    fun observeTask(taskId: String): Flow<TaskEntity?>
    suspend fun getTask(taskId: String): TaskEntity?
    fun observeSubtasks(parentId: String): Flow<List<TaskEntity>>
    fun observeSubtasksForParents(parentIds: List<String>): Flow<List<TaskEntity>>
    fun observeReminders(taskId: String): Flow<List<ReminderEntity>>
    suspend fun getReminder(reminderId: String): ReminderEntity?
    fun observeActivity(objectId: String): Flow<List<ActivityEventEntity>>
    fun observeAllActivity(): Flow<List<ActivityEventEntity>>
    fun search(query: String): Flow<List<TaskEntity>>
    fun observeLocation(locationId: String): Flow<LocationEntity?>

    suspend fun upsertProject(project: ProjectEntity)
    suspend fun upsertSection(section: SectionEntity)
    suspend fun deleteSection(sectionId: String)
    suspend fun deleteProject(projectId: String)
    suspend fun deleteTasksByProject(projectId: String)
    suspend fun deleteSectionsByProject(projectId: String)
    suspend fun upsertTask(task: TaskEntity)
    suspend fun deleteTask(taskId: String)
    suspend fun getSubtasks(parentId: String): List<TaskEntity>
    suspend fun clearCompletedTasks()
    suspend fun clearTasksInSection(sectionId: String)
    suspend fun upsertReminder(reminder: ReminderEntity)
    suspend fun deleteReminder(reminderId: String)
    suspend fun insertActivity(event: ActivityEventEntity)
    suspend fun upsertLocation(location: LocationEntity)
    suspend fun deleteLocation(locationId: String)
    suspend fun getLocation(locationId: String): LocationEntity?
    suspend fun getLocationsByIds(ids: List<String>): List<LocationEntity>

    suspend fun getEnabledReminders(): List<ReminderEntity>
    suspend fun getEnabledLocationReminders(): List<ReminderEntity>
    suspend fun getOpenTasksWithLocation(): List<TaskEntity>
}
