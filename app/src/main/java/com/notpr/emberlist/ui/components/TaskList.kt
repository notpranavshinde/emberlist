package com.notpr.emberlist.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

data class TaskListItem(
    val task: TaskEntity,
    val projectName: String,
    val sectionName: String?,
    val displayDueAt: Long? = task.dueAt,
    val isOverdue: Boolean = false,
    val isPreview: Boolean = false,
    val isSubtask: Boolean = false,
    val indentLevel: Int = 0,
    val hasSubtasks: Boolean = false,
    val isExpanded: Boolean = false
)

@Composable
fun TaskRow(
    item: TaskListItem,
    onToggle: (TaskEntity) -> Unit,
    onClick: (() -> Unit)? = null,
    onReschedule: ((TaskEntity) -> Unit)? = null,
    onDelete: ((TaskEntity) -> Unit)? = null,
    showExpand: Boolean = false,
    expanded: Boolean = false,
    onToggleExpand: (() -> Unit)? = null
) {
    val thresholdPx = with(LocalDensity.current) { 80.dp.toPx() }
    var dragX by remember { mutableStateOf(0f) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val rowModifier = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    } else {
        Modifier.fillMaxWidth()
    }

    val indentPadding = if (item.isSubtask) 24.dp * (item.indentLevel.coerceAtLeast(1)) else 0.dp
    Column(
        modifier = rowModifier
            .pointerInput(item.task.id, onReschedule, onDelete) {
                detectHorizontalDragGestures(
                    onHorizontalDrag = { change, dragAmount ->
                        dragX = (dragX + dragAmount).coerceIn(-thresholdPx * 1.5f, thresholdPx * 1.5f)
                        change.consume()
                    },
                    onDragEnd = {
                        when {
                            dragX <= -thresholdPx && onReschedule != null -> onReschedule(item.task)
                            dragX >= thresholdPx && onDelete != null -> showDeleteConfirm = true
                        }
                        dragX = 0f
                    }
                )
            }
            .offset { IntOffset(dragX.roundToInt(), 0) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp + indentPadding, end = 16.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showExpand) {
                val icon = if (expanded) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight
                Icon(
                    imageVector = icon,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    modifier = Modifier
                        .size(20.dp)
                        .clickable { onToggleExpand?.invoke() },
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            } else {
                Spacer(modifier = Modifier.size(20.dp))
            }
            TaskToggle(
                task = item.task,
                onToggle = onToggle
            )
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    text = item.task.title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                TaskMetaLine(item = item)
            }
        }
        Divider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
    }

    if (showDeleteConfirm && onDelete != null) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete task") },
            text = { Text("Delete \"${item.task.title}\"?") },
            confirmButton = {
                TextButton(onClick = {
                    onDelete(item.task)
                    showDeleteConfirm = false
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun TaskToggle(task: TaskEntity, onToggle: (TaskEntity) -> Unit) {
    val color = priorityColor(task.priority)
    val isCompleted = task.status == TaskStatus.COMPLETED
    Box(
        modifier = Modifier
            .size(22.dp)
            .border(2.dp, color, CircleShape)
            .background(if (isCompleted) color else Color.Transparent, CircleShape)
            .clickable { onToggle(task) },
        contentAlignment = Alignment.Center
    ) {
        if (isCompleted) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Completed",
                tint = Color.White,
                modifier = Modifier.size(14.dp)
            )
        }
    }
}

@Composable
private fun TaskMetaLine(item: TaskListItem) {
    val dueLabel = buildDueLabel(item)
    val metaColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (dueLabel != null) {
                val dueColor = if (item.isOverdue) Color(0xFFE05A4F) else metaColor
                Icon(
                    imageVector = Icons.Default.CalendarMonth,
                    contentDescription = null,
                    tint = dueColor,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = dueLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = dueColor,
                    modifier = Modifier.padding(start = 6.dp)
                )
            }
            if (item.task.recurringRule != null) {
                Icon(
                    imageVector = Icons.Default.Repeat,
                    contentDescription = null,
                    tint = metaColor,
                    modifier = Modifier
                        .padding(start = if (dueLabel == null) 0.dp else 8.dp)
                        .size(14.dp)
                )
            }
        }
        Text(
            text = projectLabel(item),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )
    }
}

private fun projectLabel(item: TaskListItem): String {
    return if (item.sectionName.isNullOrBlank()) item.projectName
    else "${item.projectName} / ${item.sectionName}"
}

private fun buildDueLabel(item: TaskListItem): String? {
    val dueAt = item.displayDueAt ?: return null
    val zone = ZoneId.systemDefault()
    val dateTime = Instant.ofEpochMilli(dueAt).atZone(zone).toLocalDateTime()
    return if (item.task.allDay) {
        dateTime.toLocalDate().format(DateTimeFormatter.ofPattern("MMM d"))
    } else {
        dateTime.format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }
}

private fun priorityColor(priority: Priority): Color {
    return when (priority) {
        Priority.P1 -> Color(0xFFE05A4F)
        Priority.P2 -> Color(0xFFEE6A3C)
        Priority.P3 -> Color(0xFF4B7BEC)
        Priority.P4 -> Color(0xFFA8A29E)
    }
}
