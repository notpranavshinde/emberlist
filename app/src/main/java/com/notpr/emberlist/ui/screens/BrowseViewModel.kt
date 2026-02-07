package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ProjectEntity
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

class BrowseViewModel(private val repository: TaskRepository) : ViewModel() {
    val projects: StateFlow<List<ProjectEntity>> = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun createProject(name: String) {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val project = ProjectEntity(
                id = UUID.randomUUID().toString(),
                name = name,
                color = "#EE6A3C",
                favorite = false,
                order = 0,
                archived = false,
                viewPreference = null,
                createdAt = now,
                updatedAt = now
            )
            repository.upsertProject(project)
        }
    }

    fun renameProject(project: ProjectEntity, name: String) {
        viewModelScope.launch {
            repository.upsertProject(project.copy(name = name, updatedAt = System.currentTimeMillis()))
        }
    }

    fun toggleArchive(project: ProjectEntity) {
        viewModelScope.launch {
            repository.upsertProject(
                project.copy(archived = !project.archived, updatedAt = System.currentTimeMillis())
            )
        }
    }
}
