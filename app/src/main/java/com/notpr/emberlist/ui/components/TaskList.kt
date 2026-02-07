package com.notpr.emberlist.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TaskRow(
    task: TaskEntity,
    onToggle: (TaskEntity) -> Unit,
    onClick: (() -> Unit)? = null
) {
    val rowModifier = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp)
    } else {
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    }
    Row(
        modifier = rowModifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = task.title)
            task.description.takeIf { it.isNotBlank() }?.let { desc ->
                Text(text = desc)
            }
            task.deadlineAt?.let { deadline ->
                val zone = ZoneId.systemDefault()
                val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
                val dt = Instant.ofEpochMilli(deadline).atZone(zone).toLocalDateTime()
                val label = if (task.deadlineAllDay) {
                    "Deadline: ${dt.toLocalDate()} · All day"
                } else {
                    "Deadline: ${dt.format(formatter)}"
                }
                Text(text = label)
            }
        }
        Checkbox(
            checked = task.status == TaskStatus.COMPLETED,
            onCheckedChange = { onToggle(task) }
        )
    }
}
