package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.completeTaskWithRecurrence
import com.notpr.emberlist.domain.logActivity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

class ProjectViewModel(private val repository: TaskRepository) : ViewModel() {
    fun observeProject(projectId: String): StateFlow<ProjectEntity?> =
        repository.observeProject(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun observeTasks(projectId: String): StateFlow<List<TaskEntity>> =
        repository.observeProjectTasks(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun observeSections(projectId: String): StateFlow<List<SectionEntity>> =
        repository.observeSections(projectId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun updateProject(project: ProjectEntity) {
        viewModelScope.launch {
            repository.upsertProject(project.copy(updatedAt = System.currentTimeMillis()))
        }
    }

    fun moveTaskToSection(task: TaskEntity, sectionId: String?, newOrder: Int) {
        viewModelScope.launch {
            repository.upsertTask(
                task.copy(
                    sectionId = sectionId,
                    order = newOrder,
                    updatedAt = System.currentTimeMillis()
                )
            )
        }
    }

    fun createSection(projectId: String, name: String) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val section = SectionEntity(
                id = UUID.randomUUID().toString(),
                projectId = projectId,
                name = name,
                order = 0,
                createdAt = now,
                updatedAt = now
            )
            repository.upsertSection(section)
        }
    }

    fun renameSection(section: SectionEntity, name: String) {
        viewModelScope.launch {
            repository.upsertSection(section.copy(name = name, updatedAt = System.currentTimeMillis()))
        }
    }

    fun deleteSection(section: SectionEntity) {
        viewModelScope.launch {
            repository.clearTasksInSection(section.id)
            repository.deleteSection(section.id)
        }
    }

    fun toggleComplete(task: TaskEntity) {
        viewModelScope.launch {
            if (task.status != TaskStatus.COMPLETED) {
                completeTaskWithRecurrence(repository, task)
            } else {
                repository.upsertTask(
                    task.copy(
                        status = TaskStatus.OPEN,
                        completedAt = null,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                logActivity(repository, ActivityType.UNCOMPLETED, ObjectType.TASK, task.id)
            }
        }
    }
}
