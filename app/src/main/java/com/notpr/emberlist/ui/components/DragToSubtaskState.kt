package com.notpr.emberlist.ui.components

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import com.notpr.emberlist.data.model.TaskEntity

class DragToSubtaskState {
    private val boundsById = mutableStateMapOf<String, Rect>()
    private val tasksById = mutableStateMapOf<String, TaskEntity>()

    var draggingTask: TaskEntity? by mutableStateOf(null)
        private set
    var dragPosition: Offset? by mutableStateOf(null)
        private set
    var hoverTargetId: String? by mutableStateOf(null)
        private set

    val draggingTaskId: String?
        get() = draggingTask?.id

    fun registerTask(task: TaskEntity) {
        tasksById[task.id] = task
    }

    fun updateBounds(taskId: String, rect: Rect) {
        boundsById[taskId] = rect
    }

    fun startDrag(task: TaskEntity, startPosition: Offset) {
        draggingTask = task
        dragPosition = startPosition
        updateHover()
    }

    fun updateDrag(delta: Offset) {
        val current = dragPosition ?: return
        dragPosition = current + delta
        updateHover()
    }

    fun endDrag(): Pair<TaskEntity, TaskEntity>? {
        val dragTask = draggingTask ?: return null.also { reset() }
        val target = hoverTargetId?.let { tasksById[it] }
        reset()
        if (target == null) return null
        if (target.id == dragTask.id) return null
        if (target.parentTaskId != null) return null
        return dragTask to target
    }

    fun cancelDrag() {
        reset()
    }

    private fun reset() {
        draggingTask = null
        dragPosition = null
        hoverTargetId = null
    }

    private fun updateHover() {
        val position = dragPosition ?: return
        val draggingId = draggingTask?.id
        val candidateId = boundsById.entries.firstOrNull { entry ->
            entry.value.contains(position) && entry.key != draggingId
        }?.key
        val candidate = candidateId?.let { tasksById[it] }
        hoverTargetId = if (candidate != null && candidate.parentTaskId == null && candidate.id != draggingId) {
            candidateId
        } else {
            null
        }
    }
}
