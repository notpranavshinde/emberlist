package com.notpr.emberlist.ui.screens

import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.ui.components.TaskListItem

fun buildTaskListItem(
    task: TaskEntity,
    projectById: Map<String, ProjectEntity>,
    sectionById: Map<String, SectionEntity>,
    displayDueAt: Long? = task.dueAt,
    isOverdue: Boolean = false,
    isPreview: Boolean = false
): TaskListItem {
    val projectName = projectById[task.projectId]?.name ?: "Inbox"
    val sectionName = sectionById[task.sectionId]?.name
    return TaskListItem(
        task = task,
        projectName = projectName,
        sectionName = sectionName,
        displayDueAt = displayDueAt,
        isOverdue = isOverdue,
        isPreview = isPreview
    )
}

