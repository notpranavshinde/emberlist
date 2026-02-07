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
        }
        Checkbox(
            checked = task.status == TaskStatus.COMPLETED,
            onCheckedChange = { onToggle(task) }
        )
    }
}
