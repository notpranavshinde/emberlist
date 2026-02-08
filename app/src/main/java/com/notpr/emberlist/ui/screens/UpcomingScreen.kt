package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun UpcomingScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: UpcomingViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val items by viewModel.tasks.collectAsState()
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }
    val grouped = items.groupBy { item ->
        val date = Instant.ofEpochMilli(item.displayDueAt).atZone(ZoneId.systemDefault()).toLocalDate()
        date ?: Instant.ofEpochMilli(System.currentTimeMillis()).atZone(ZoneId.systemDefault()).toLocalDate()
    }

    val formatter = DateTimeFormatter.ofPattern("EEE, MMM d")

    LaunchedEffect(rescheduleTarget) {
        val task = rescheduleTarget ?: return@LaunchedEffect
        val baseDate = task.dueAt?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDate() }
            ?: LocalDate.now(zone)
        val dialog = DatePickerDialog(
            context,
            { _, year, month, day ->
                viewModel.rescheduleToDate(task, LocalDate.of(year, month + 1, day))
                rescheduleTarget = null
            },
            baseDate.year,
            baseDate.monthValue - 1,
            baseDate.dayOfMonth
        )
        dialog.setOnCancelListener { rescheduleTarget = null }
        dialog.setOnDismissListener { rescheduleTarget = null }
        dialog.show()
    }

    LazyColumn(
        contentPadding = padding,
        modifier = Modifier.background(MaterialTheme.colorScheme.background)
    ) {
        item(key = "upcoming_header") {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(text = "Upcoming", style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "${items.size} tasks",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        grouped.forEach { (date, list) ->
            item(key = date.toString()) {
                Text(
                    text = date.format(formatter),
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp)
                )
            }
            items(list, key = { it.item.task.id + it.displayDueAt }) { item ->
                DraggableTaskRow(
                    taskTitle = item.item.task.title,
                    onReschedule = { delta -> viewModel.reschedule(item.item.task, delta) }
                ) {
                    TaskRow(
                        item = item.item,
                        onToggle = viewModel::toggleComplete,
                        onReschedule = { rescheduleTarget = it },
                        onDelete = viewModel::deleteTask,
                        onClick = { navController.navigate("task/${item.item.task.id}") }
                    )
                }
            }
        }
    }
}

@Composable
private fun DraggableTaskRow(
    taskTitle: String,
    onReschedule: (Long) -> Unit,
    content: @Composable () -> Unit
) {
    var dragY by remember { mutableStateOf(0f) }
    val threshold = 80f
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.pointerInput(taskTitle) {
            detectDragGestures(
                onDrag = { change, dragAmount ->
                    change.consume()
                    dragY += dragAmount.y
                },
                onDragEnd = {
                    if (dragY > threshold) {
                        onReschedule(1)
                    } else if (dragY < -threshold) {
                        onReschedule(-1)
                    }
                    dragY = 0f
                }
            )
        }
    ) {
        content()
    }
}
