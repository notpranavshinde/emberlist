package com.notpr.emberlist

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
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
    val projects = LinkedHashMap<String, ProjectEntity>()
    val sections = LinkedHashMap<String, SectionEntity>()

    override fun observeInbox(): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeToday(endOfDay: Long): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeCompletedToday(startOfDay: Long, endOfDay: Long): Flow<List<TaskEntity>> =
        flowOf(tasks.values.toList())
    override fun observeUpcoming(startOfTomorrow: Long): Flow<List<TaskEntity>> = flowOf(tasks.values.toList())
    override fun observeOverdueRecurring(startOfTomorrow: Long): Flow<List<TaskEntity>> = flowOf(emptyList())
    override fun observeProjects(): Flow<List<ProjectEntity>> = flowOf(projects.values.toList())
    override fun observeProjectTaskCounts() = flowOf(emptyList<com.notpr.emberlist.data.model.ProjectTaskCount>())
    override fun observeProject(projectId: String): Flow<ProjectEntity?> = flowOf(projects[projectId])
    override suspend fun getProjectByName(name: String): ProjectEntity? =
        projects.values.firstOrNull { it.name.equals(name, ignoreCase = true) }
    override suspend fun getSectionByName(projectId: String, name: String): SectionEntity? =
        sections.values.firstOrNull { it.projectId == projectId && it.name.equals(name, ignoreCase = true) }
    override fun observeProjectTasks(projectId: String): Flow<List<TaskEntity>> =
        flowOf(tasks.values.filter { it.projectId == projectId })
    override fun observeSections(projectId: String): Flow<List<SectionEntity>> =
        flowOf(sections.values.filter { it.projectId == projectId })
    override fun observeAllSections(): Flow<List<SectionEntity>> = flowOf(sections.values.toList())
    override fun observeTask(taskId: String): Flow<TaskEntity?> = flowOf(tasks[taskId])
    override suspend fun getTask(taskId: String): TaskEntity? = tasks[taskId]
    override fun observeSubtasks(parentId: String): Flow<List<TaskEntity>> =
        flowOf(tasks.values.filter { it.parentTaskId == parentId })
    override fun observeSubtasksForParents(parentIds: List<String>): Flow<List<TaskEntity>> =
        flowOf(tasks.values.filter { it.parentTaskId in parentIds })
    override fun observeReminders(taskId: String): Flow<List<ReminderEntity>> =
        flowOf(reminders.values.filter { it.taskId == taskId })
    override fun observeEnabledReminders(): Flow<List<ReminderEntity>> =
        flowOf(reminders.values.filter { it.enabled })
    override suspend fun getReminder(reminderId: String): ReminderEntity? = reminders[reminderId]
    override suspend fun getRemindersForTask(taskId: String): List<ReminderEntity> =
        reminders.values.filter { it.taskId == taskId }
    override fun observeActivity(objectId: String): Flow<List<ActivityEventEntity>> = flowOf(activities)
    override fun observeAllActivity(): Flow<List<ActivityEventEntity>> = flowOf(activities)
    override fun search(query: String): Flow<List<TaskEntity>> = flowOf(emptyList())

    override suspend fun upsertProject(project: ProjectEntity) {
        projects[project.id] = project
    }
    override suspend fun upsertSection(section: SectionEntity) {
        sections[section.id] = section
    }
    override suspend fun deleteSection(sectionId: String) {
        sections.remove(sectionId)
    }
    override suspend fun deleteProject(projectId: String) {
        projects.remove(projectId)
    }
    override suspend fun deleteTasksByProject(projectId: String) {
        tasks.entries.removeIf { it.value.projectId == projectId }
    }
    override suspend fun deleteSectionsByProject(projectId: String) {
        sections.entries.removeIf { it.value.projectId == projectId }
    }

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

    override suspend fun deleteRemindersForTask(taskId: String) {
        reminders.entries.removeIf { it.value.taskId == taskId }
    }

    override suspend fun deleteEphemeralRemindersForTask(taskId: String) {
        reminders.entries.removeIf { it.value.taskId == taskId && it.value.ephemeral }
    }

    override suspend fun insertActivity(event: ActivityEventEntity) {
        activities.add(event)
    }

    override suspend fun getEnabledReminders(): List<ReminderEntity> =
        reminders.values.filter { it.enabled }
}
