package com.notpr.emberlist.ui.screens

import com.notpr.emberlist.ui.components.TaskListItem

fun flattenTaskItemsWithSubtasks(
    parents: List<TaskListItem>,
    subtasks: List<TaskListItem>,
    expandedState: Map<String, Boolean>,
    defaultExpanded: Boolean
): List<TaskListItem> {
    if (parents.isEmpty()) return emptyList()
    val subtasksByParent = subtasks.groupBy { it.task.parentTaskId }
    val result = ArrayList<TaskListItem>(parents.size + subtasks.size)
    parents.forEach { parent ->
        val children = subtasksByParent[parent.task.id].orEmpty()
        val hasSubtasks = children.isNotEmpty()
        val isExpanded = expandedState[parent.task.id] ?: defaultExpanded
        result += parent.copy(hasSubtasks = hasSubtasks, isExpanded = isExpanded)
        if (hasSubtasks && isExpanded) {
            children.forEach { child ->
                result += child.copy(isSubtask = true, indentLevel = 1)
            }
        }
    }
    return result
}

fun flattenUpcomingItemsWithSubtasks(
    parents: List<UpcomingItem>,
    subtasks: List<TaskListItem>,
    expandedState: Map<String, Boolean>,
    defaultExpanded: Boolean
): List<UpcomingItem> {
    if (parents.isEmpty()) return emptyList()
    val subtasksByParent = subtasks.groupBy { it.task.parentTaskId }
    val result = ArrayList<UpcomingItem>(parents.size + subtasks.size)
    parents.forEach { parent ->
        val children = subtasksByParent[parent.item.task.id].orEmpty()
        val hasSubtasks = children.isNotEmpty()
        val isExpanded = expandedState[parent.item.task.id] ?: defaultExpanded
        result += parent.copy(
            item = parent.item.copy(hasSubtasks = hasSubtasks, isExpanded = isExpanded)
        )
        if (hasSubtasks && isExpanded && !parent.isPreview) {
            children.forEach { child ->
                result += UpcomingItem(
                    item = child.copy(isSubtask = true, indentLevel = 1),
                    displayDueAt = parent.displayDueAt,
                    isPreview = false
                )
            }
        }
    }
    return result
}
