package com.notpr.emberlist.data

import com.notpr.emberlist.data.model.ActivityEventEntity
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
    fun observeProjectTasks(projectId: String): Flow<List<TaskEntity>>
    fun observeSections(projectId: String): Flow<List<SectionEntity>>
    fun observeAllSections(): Flow<List<SectionEntity>>
    fun observeTask(taskId: String): Flow<TaskEntity?>
    fun observeSubtasks(parentId: String): Flow<List<TaskEntity>>
    fun observeReminders(taskId: String): Flow<List<ReminderEntity>>
    fun observeActivity(objectId: String): Flow<List<ActivityEventEntity>>
    fun search(query: String): Flow<List<TaskEntity>>

    suspend fun upsertProject(project: ProjectEntity)
    suspend fun upsertSection(section: SectionEntity)
    suspend fun deleteSection(sectionId: String)
    suspend fun upsertTask(task: TaskEntity)
    suspend fun deleteTask(taskId: String)
    suspend fun clearCompletedTasks()
    suspend fun clearTasksInSection(sectionId: String)
    suspend fun upsertReminder(reminder: ReminderEntity)
    suspend fun deleteReminder(reminderId: String)
    suspend fun insertActivity(event: ActivityEventEntity)

    suspend fun getEnabledReminders(): List<ReminderEntity>
}
