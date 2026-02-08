package com.notpr.emberlist.data

import com.notpr.emberlist.data.dao.ActivityDao
import com.notpr.emberlist.data.dao.ProjectDao
import com.notpr.emberlist.data.dao.ReminderDao
import com.notpr.emberlist.data.dao.SectionDao
import com.notpr.emberlist.data.dao.TaskDao
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.coroutines.flow.Flow

class TaskRepositoryImpl(
    private val projectDao: ProjectDao,
    private val sectionDao: SectionDao,
    private val taskDao: TaskDao,
    private val reminderDao: ReminderDao,
    private val activityDao: ActivityDao
) : TaskRepository {
    override fun observeInbox(): Flow<List<TaskEntity>> = taskDao.observeInbox()

    override fun observeToday(endOfDay: Long): Flow<List<TaskEntity>> = taskDao.observeToday(endOfDay = endOfDay)

    override fun observeUpcoming(startOfTomorrow: Long): Flow<List<TaskEntity>> =
        taskDao.observeUpcoming(startOfTomorrow = startOfTomorrow)

    override fun observeOverdueRecurring(startOfTomorrow: Long): Flow<List<TaskEntity>> =
        taskDao.observeOverdueRecurring(startOfTomorrow = startOfTomorrow)

    override fun observeProjects(): Flow<List<ProjectEntity>> = projectDao.observeActiveProjects()

    override fun observeProjectTaskCounts(): Flow<List<com.notpr.emberlist.data.model.ProjectTaskCount>> =
        taskDao.observeProjectTaskCounts()

    override fun observeProject(projectId: String): Flow<ProjectEntity?> = projectDao.observeProject(projectId)

    override suspend fun getProjectByName(name: String): ProjectEntity? = projectDao.getByName(name)

    override fun observeProjectTasks(projectId: String): Flow<List<TaskEntity>> = taskDao.observeProjectTasks(projectId)

    override fun observeSections(projectId: String): Flow<List<SectionEntity>> = sectionDao.observeSections(projectId)

    override fun observeAllSections(): Flow<List<SectionEntity>> = sectionDao.observeAllSections()

    override fun observeTask(taskId: String): Flow<TaskEntity?> = taskDao.observeTask(taskId)

    override fun observeSubtasks(parentId: String): Flow<List<TaskEntity>> = taskDao.observeSubtasks(parentId)

    override fun observeReminders(taskId: String): Flow<List<ReminderEntity>> = reminderDao.observeForTask(taskId)

    override fun observeActivity(objectId: String): Flow<List<ActivityEventEntity>> = activityDao.observeForObject(objectId)

    override fun search(query: String): Flow<List<TaskEntity>> = taskDao.search(query)

    override suspend fun upsertProject(project: ProjectEntity) {
        projectDao.upsert(project)
    }

    override suspend fun upsertSection(section: SectionEntity) {
        sectionDao.upsert(section)
    }

    override suspend fun deleteSection(sectionId: String) {
        sectionDao.delete(sectionId)
    }

    override suspend fun upsertTask(task: TaskEntity) {
        taskDao.upsert(task)
    }

    override suspend fun deleteTask(taskId: String) {
        taskDao.delete(taskId)
    }

    override suspend fun clearCompletedTasks() {
        taskDao.deleteCompleted()
    }

    override suspend fun clearTasksInSection(sectionId: String) {
        taskDao.clearSection(sectionId)
    }

    override suspend fun upsertReminder(reminder: ReminderEntity) {
        reminderDao.upsert(reminder)
    }

    override suspend fun deleteReminder(reminderId: String) {
        reminderDao.delete(reminderId)
    }

    override suspend fun insertActivity(event: ActivityEventEntity) {
        activityDao.insert(event)
    }

    override suspend fun getEnabledReminders(): List<ReminderEntity> = reminderDao.getEnabled()
}
