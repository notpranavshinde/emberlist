package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileMove
import androidx.compose.material.icons.filled.Flag
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
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
import kotlin.math.abs

@Composable
fun UpcomingScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: UpcomingViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val parentItems by viewModel.tasks.collectAsState()
    val subtaskItems by viewModel.subtasks.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    val items = flattenUpcomingItemsWithSubtasks(
        parents = parentItems,
        subtasks = subtaskItems,
        expandedState = expanded,
        defaultExpanded = false
    )
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateOf(setOf<String>()) }
    var rescheduleSelected by remember { mutableStateOf(false) }
    var showPriorityPicker by remember { mutableStateOf(false) }
    var showProjectPicker by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
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

    LaunchedEffect(rescheduleSelected) {
        if (!rescheduleSelected) return@LaunchedEffect
        val baseDate = LocalDate.now(zone)
        val dialog = DatePickerDialog(
            context,
            { _, year, month, day ->
                viewModel.rescheduleTasksToDate(selectedIds.value.toList(), LocalDate.of(year, month + 1, day))
                rescheduleSelected = false
                selectionMode = false
                selectedIds.value = emptySet()
            },
            baseDate.year,
            baseDate.monthValue - 1,
            baseDate.dayOfMonth
        )
        dialog.setOnCancelListener { rescheduleSelected = false }
        dialog.setOnDismissListener { rescheduleSelected = false }
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
                    text = "${parentItems.size} tasks",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        if (selectionMode) {
            item(key = "upcoming_bulk") {
                LazyRow(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        IconButton(onClick = {
                            selectionMode = false
                            selectedIds.value = emptySet()
                        }) {
                            Icon(Icons.Default.Close, contentDescription = "Cancel")
                        }
                    }
                    if (selectedIds.value.isNotEmpty()) {
                        item {
                            IconButton(onClick = { rescheduleSelected = true }) {
                                Icon(Icons.Default.CalendarMonth, contentDescription = "Reschedule")
                            }
                        }
                        item {
                            IconButton(onClick = { showProjectPicker = true }) {
                                Icon(Icons.Default.DriveFileMove, contentDescription = "Move")
                            }
                        }
                        item {
                            IconButton(onClick = { showPriorityPicker = true }) {
                                Icon(Icons.Default.Flag, contentDescription = "Priority")
                            }
                        }
                        item {
                            IconButton(onClick = { showDeleteConfirm = true }) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Delete",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
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
                    selectionMode = selectionMode,
                    allowSelect = !item.isPreview,
                    selected = selectedIds.value.contains(item.item.task.id),
                    onSelectToggle = { checked ->
                        selectedIds.value = if (checked) {
                            selectedIds.value + item.item.task.id
                        } else {
                            selectedIds.value - item.item.task.id
                        }
                    },
                    onEnterSelection = {
                        selectionMode = true
                        selectedIds.value = selectedIds.value + item.item.task.id
                    },
                    onOpen = { navController.navigate("task/${item.item.task.id}") },
                    onReschedule = { delta ->
                        if (!item.isPreview) viewModel.reschedule(item.item.task, delta)
                    }
                ) {
                    TaskRow(
                        item = item.item,
                        showExpand = item.item.hasSubtasks,
                        expanded = item.item.isExpanded,
                        onToggleExpand = {
                            expanded[item.item.task.id] = !(expanded[item.item.task.id] ?: false)
                        },
                        onToggle = if (selectionMode) ({ _: com.notpr.emberlist.data.model.TaskEntity -> }) else viewModel::toggleComplete,
                        onReschedule = if (selectionMode) null else ({ task -> rescheduleTarget = task }),
                        onDelete = if (selectionMode) null else viewModel::deleteTask,
                        onClick = null
                    )
                }
            }
        }
    }

    if (showPriorityPicker) {
        AlertDialog(
            onDismissRequest = { showPriorityPicker = false },
            title = { Text("Change priority") },
            text = {
                Column {
                    com.notpr.emberlist.data.model.Priority.values().forEach { p ->
                        TextButton(onClick = {
                            viewModel.setPriorityForTasks(selectedIds.value.toList(), p)
                            showPriorityPicker = false
                            selectionMode = false
                            selectedIds.value = emptySet()
                        }) { Text(p.name) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showPriorityPicker = false }) { Text("Close") } }
        )
    }

    if (showProjectPicker) {
        AlertDialog(
            onDismissRequest = { showProjectPicker = false },
            title = { Text("Move tasks") },
            text = {
                Column {
                    TextButton(onClick = {
                        viewModel.moveTasksToProject(selectedIds.value.toList(), null)
                        showProjectPicker = false
                        selectionMode = false
                        selectedIds.value = emptySet()
                    }) { Text("Inbox") }
                    projects.forEach { project ->
                        TextButton(onClick = {
                            viewModel.moveTasksToProject(selectedIds.value.toList(), project.id)
                            showProjectPicker = false
                            selectionMode = false
                            selectedIds.value = emptySet()
                        }) { Text(project.name) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showProjectPicker = false }) { Text("Close") } }
        )
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete tasks") },
            text = { Text("Delete ${selectedIds.value.size} tasks?") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteTasks(selectedIds.value.toList())
                    showDeleteConfirm = false
                    selectionMode = false
                    selectedIds.value = emptySet()
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DraggableTaskRow(
    taskTitle: String,
    selectionMode: Boolean,
    allowSelect: Boolean,
    selected: Boolean,
    onSelectToggle: (Boolean) -> Unit,
    onEnterSelection: () -> Unit,
    onOpen: () -> Unit,
    onReschedule: (Long) -> Unit,
    content: @Composable () -> Unit
) {
    val threshold = 80f
    val modifier = if (selectionMode && allowSelect) {
        Modifier.pointerInput(taskTitle, selected) {
            awaitPointerEventScope {
                while (true) {
                    awaitFirstDown()
                    val up = waitForUpOrCancellation()
                    if (up != null) onSelectToggle(!selected)
                }
            }
        }
    } else {
        Modifier.pointerInput(taskTitle) {
            awaitPointerEventScope {
                while (true) {
                    val down = awaitFirstDown()
                    val longPress = awaitLongPressOrCancellation(down.id)
                    if (longPress == null) {
                        val up = waitForUpOrCancellation()
                        if (up != null) onOpen()
                        continue
                    }
                    var dragTotal = 0f
                    var done = false
                    while (!done) {
                        val event = awaitPointerEvent(PointerEventPass.Main)
                        val change = event.changes.first()
                        dragTotal += change.positionChange().y
                        if (change.changedToUp()) {
                            done = true
                        }
                        change.consume()
                    }
                    if (kotlin.math.abs(dragTotal) > threshold) {
                        onReschedule(if (dragTotal > 0f) 1 else -1)
                    } else if (allowSelect) {
                        onEnterSelection()
                    } else {
                        onOpen()
                    }
                }
            }
        }
    }
    androidx.compose.foundation.layout.Box(modifier = modifier) { content() }
}
