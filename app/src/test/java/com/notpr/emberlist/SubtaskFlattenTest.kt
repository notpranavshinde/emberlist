package com.notpr.emberlist

import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.screens.UpcomingItem
import com.notpr.emberlist.ui.screens.flattenTaskItemsWithSubtasks
import com.notpr.emberlist.ui.screens.flattenUpcomingItemsWithSubtasks
import org.junit.Assert.assertEquals
import org.junit.Test

class SubtaskFlattenTest {
    @Test
    fun flattenTaskItemsHonorsExpandedState() {
        val parent = taskItem("p1")
        val child = taskItem("c1", parentId = "p1")
        val resultCollapsed = flattenTaskItemsWithSubtasks(
            parents = listOf(parent),
            subtasks = listOf(child),
            expandedState = mapOf("p1" to false),
            defaultExpanded = false
        )
        assertEquals(listOf("p1"), resultCollapsed.map { it.task.id })

        val resultExpanded = flattenTaskItemsWithSubtasks(
            parents = listOf(parent),
            subtasks = listOf(child),
            expandedState = mapOf("p1" to true),
            defaultExpanded = false
        )
        assertEquals(listOf("p1", "c1"), resultExpanded.map { it.task.id })
    }

    @Test
    fun flattenUpcomingHonorsExpandedState() {
        val parent = taskItem("p1")
        val child = taskItem("c1", parentId = "p1")
        val upcoming = listOf(UpcomingItem(item = parent, displayDueAt = parent.task.dueAt ?: 0L, isPreview = false))
        val result = flattenUpcomingItemsWithSubtasks(
            parents = upcoming,
            subtasks = listOf(child),
            expandedState = mapOf("p1" to true),
            defaultExpanded = false
        )
        assertEquals(listOf("p1", "c1"), result.map { it.item.task.id })
    }

    private fun taskItem(id: String, parentId: String? = null): TaskListItem {
        val task = TaskEntity(
            id = id,
            title = id,
            description = "",
            projectId = null,
            sectionId = null,
            priority = Priority.P3,
            dueAt = 0L,
            allDay = false,
            deadlineAt = null,
            deadlineAllDay = false,
            recurringRule = null,
            deadlineRecurringRule = null,
            status = TaskStatus.OPEN,
            completedAt = null,
            parentTaskId = parentId,
            locationId = null,
            locationTriggerType = null,
            order = 0,
            createdAt = 0L,
            updatedAt = 0L
        )
        return TaskListItem(task = task, projectName = "Inbox", sectionName = null)
    }
}
