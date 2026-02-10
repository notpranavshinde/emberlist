package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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

@Composable
fun TodayScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TodayViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val parentItems by viewModel.tasks.collectAsState()
    val subtaskItems by viewModel.subtasks.collectAsState()
    val expanded = rememberSaveable { mutableStateMapOf<String, Boolean>() }
    val overdueParents = parentItems.filter { it.isOverdue }
    val todayParents = parentItems.filterNot { it.isOverdue }
    val overdue = flattenTaskItemsWithSubtasks(
        parents = overdueParents,
        subtasks = subtaskItems,
        expandedState = expanded,
        defaultExpanded = false
    )
    val today = flattenTaskItemsWithSubtasks(
        parents = todayParents,
        subtasks = subtaskItems,
        expandedState = expanded,
        defaultExpanded = false
    )
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }
    var rescheduleOverdue by remember { mutableStateOf(false) }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateOf(setOf<String>()) }
    var rescheduleSelected by remember { mutableStateOf(false) }
    var showPriorityPicker by remember { mutableStateOf(false) }
    var showProjectPicker by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val projects by viewModel.projects.collectAsState()

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

    LaunchedEffect(rescheduleOverdue) {
        if (!rescheduleOverdue) return@LaunchedEffect
        val baseDate = LocalDate.now(zone)
        val dialog = DatePickerDialog(
            context,
            { _, year, month, day ->
                viewModel.rescheduleOverdueToDate(LocalDate.of(year, month + 1, day))
                rescheduleOverdue = false
            },
            baseDate.year,
            baseDate.monthValue - 1,
            baseDate.dayOfMonth
        )
        dialog.setOnCancelListener { rescheduleOverdue = false }
        dialog.setOnDismissListener { rescheduleOverdue = false }
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
        item(key = "today_header") {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(text = "Today", style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "${parentItems.size} tasks",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        if (selectionMode) {
            item(key = "bulk_actions") {
                LazyRow(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
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
        if (overdue.isNotEmpty()) {
            item(key = "overdue_header") {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "Overdue", style = MaterialTheme.typography.titleSmall)
                    TextButton(onClick = { rescheduleOverdue = true }) {
                        Text(text = "Reschedule overdue tasks")
                    }
                }
            }
            items(overdue, key = { it.task.id }) { item ->
                TaskRowSelectable(
                    item = item,
                    selectionMode = selectionMode,
                    selected = selectedIds.value.contains(item.task.id),
                    onSelectToggle = { checked ->
                        selectedIds.value = if (checked) selectedIds.value + item.task.id else selectedIds.value - item.task.id
                    },
                    onEnterSelection = {
                        selectionMode = true
                        selectedIds.value = selectedIds.value + item.task.id
                    },
                    onOpen = { navController.navigate("task/${item.task.id}") },
                    onToggle = viewModel::toggleComplete,
                    showExpand = item.hasSubtasks,
                    expanded = item.isExpanded,
                    onToggleExpand = {
                        expanded[item.task.id] = !(expanded[item.task.id] ?: false)
                    },
                    onReschedule = { rescheduleTarget = it },
                    onDelete = viewModel::deleteTask
                )
            }
        }
        items(today, key = { it.task.id }) { item ->
            TaskRowSelectable(
                item = item,
                selectionMode = selectionMode,
                selected = selectedIds.value.contains(item.task.id),
                onSelectToggle = { checked ->
                    selectedIds.value = if (checked) selectedIds.value + item.task.id else selectedIds.value - item.task.id
                },
                onEnterSelection = {
                    selectionMode = true
                    selectedIds.value = selectedIds.value + item.task.id
                },
                onOpen = { navController.navigate("task/${item.task.id}") },
                onToggle = viewModel::toggleComplete,
                showExpand = item.hasSubtasks,
                expanded = item.isExpanded,
                onToggleExpand = {
                    expanded[item.task.id] = !(expanded[item.task.id] ?: false)
                },
                onReschedule = { rescheduleTarget = it },
                onDelete = viewModel::deleteTask
            )
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
private fun TaskRowSelectable(
    item: com.notpr.emberlist.ui.components.TaskListItem,
    selectionMode: Boolean,
    selected: Boolean,
    onSelectToggle: (Boolean) -> Unit,
    onEnterSelection: () -> Unit,
    onOpen: () -> Unit,
    onToggle: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onReschedule: ((com.notpr.emberlist.data.model.TaskEntity) -> Unit)?,
    onDelete: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    showExpand: Boolean,
    expanded: Boolean,
    onToggleExpand: () -> Unit
) {
    val modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 6.dp)
        .combinedClickable(
            onClick = {
                if (selectionMode) onSelectToggle(!selected) else onOpen()
            },
            onLongClick = {
                if (!selectionMode) onEnterSelection()
            }
        )
    Row(modifier = modifier) {
        if (selectionMode) {
            androidx.compose.material3.Checkbox(checked = selected, onCheckedChange = null)
        }
        Column(modifier = Modifier.weight(1f).padding(start = if (selectionMode) 8.dp else 0.dp)) {
            TaskRow(
                item = item,
                onToggle = if (selectionMode) ({ _: com.notpr.emberlist.data.model.TaskEntity -> }) else onToggle,
                onReschedule = if (selectionMode) null else onReschedule,
                onDelete = if (selectionMode) null else onDelete,
                onClick = null,
                showExpand = showExpand,
                expanded = expanded,
                onToggleExpand = onToggleExpand
            )
        }
    }
}
