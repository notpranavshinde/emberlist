package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun UpcomingScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: UpcomingViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val items by viewModel.tasks.collectAsState()
    val grouped = items.groupBy { item ->
        val date = Instant.ofEpochMilli(item.displayDueAt).atZone(ZoneId.systemDefault()).toLocalDate()
        date ?: Instant.ofEpochMilli(System.currentTimeMillis()).atZone(ZoneId.systemDefault()).toLocalDate()
    }

    val formatter = DateTimeFormatter.ofPattern("EEE, MMM d")

    LazyColumn(contentPadding = padding) {
        grouped.forEach { (date, list) ->
            item(key = date.toString()) {
                Text(
                    text = date.format(formatter),
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp)
                )
            }
            items(list, key = { it.task.id + it.displayDueAt }) { item ->
                DraggableTaskRow(
                    taskTitle = item.task.title,
                    onReschedule = { delta -> viewModel.reschedule(item.task, delta) }
                ) {
                    TaskRow(
                        task = item.task,
                        onToggle = viewModel::toggleComplete,
                        onClick = { navController.navigate("task/${item.task.id}") }
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
