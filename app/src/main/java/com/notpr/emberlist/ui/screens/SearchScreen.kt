package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileMove
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.DayOfWeek
import java.time.temporal.TemporalAdjusters

@Composable
fun SearchScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: SearchViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val results by viewModel.results.collectAsState()
    val projects by viewModel.projects.collectAsState()
    var query by remember { mutableStateOf("") }
    var searchActive by remember { mutableStateOf(false) }
    val searchFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateOf(setOf<String>()) }
    var rescheduleSelected by remember { mutableStateOf(false) }
    var showPriorityPicker by remember { mutableStateOf(false) }
    var showProjectPicker by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var activeFilter by remember { mutableStateOf(SmartFilter.ALL) }
    val filteredResults = remember(results, activeFilter) {
        results.filter { activeFilter.matches(it, zone) }
    }

    LaunchedEffect(searchActive) {
        if (searchActive) {
            searchFocusRequester.requestFocus()
        }
    }

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

    Column(
        modifier = Modifier
            .background(MaterialTheme.colorScheme.background)
            .padding(padding)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween
        ) {
            if (searchActive) {
                TextField(
                    value = query,
                    onValueChange = {
                        query = it
                        viewModel.updateQuery(it)
                    },
                    placeholder = { Text("Search") },
                    singleLine = true,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(searchFocusRequester)
                )
                IconButton(onClick = {
                    query = ""
                    viewModel.updateQuery("")
                    searchActive = false
                    focusManager.clearFocus()
                }) {
                    Icon(Icons.Default.Close, contentDescription = "Close search")
                }
            } else {
                Column {
                    Text(text = "Search", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        text = "${filteredResults.size} tasks",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
                IconButton(onClick = { searchActive = true }) {
                    Icon(Icons.Default.Search, contentDescription = "Search")
                }
            }
        }
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)
        ) {
            items(SmartFilter.values()) { filter ->
                val selected = filter == activeFilter
                AssistChip(
                    onClick = { activeFilter = filter },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        else MaterialTheme.colorScheme.surfaceVariant,
                        labelColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                    ),
                    label = { Text(filter.label) }
                )
            }
        }
        if (selectionMode) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Start
            ) {
                LazyRow(
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
        LazyColumn {
            items(filteredResults, key = { it.task.id }) { item ->
                SearchTaskRowSelectable(
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
                    onReschedule = { rescheduleTarget = it },
                    onDelete = viewModel::deleteTask
                )
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

private enum class SmartFilter(val label: String, val matches: (com.notpr.emberlist.ui.components.TaskListItem, ZoneId) -> Boolean) {
    ALL("All", { _, _ -> true }),
    OVERDUE("Overdue", { item, _ -> item.isOverdue }),
    TODAY("Today", { item, zone ->
        val dueAt = item.task.dueAt
        if (dueAt == null) {
            false
        } else {
            val today = LocalDate.now(zone)
            val start = today.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
            dueAt in start..end
        }
    }),
    THIS_WEEK("This Week", { item, zone ->
        val dueAt = item.task.dueAt
        if (dueAt == null) {
            false
        } else {
            val today = LocalDate.now(zone)
            val endOfWeek = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
            val start = today.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = endOfWeek.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
            dueAt in start..end
        }
    }),
    HIGH_PRIORITY("High", { item, _ ->
        item.task.priority == com.notpr.emberlist.data.model.Priority.P1 ||
            item.task.priority == com.notpr.emberlist.data.model.Priority.P2
    }),
    INBOX("Inbox", { item, _ -> item.task.projectId == null });
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SearchTaskRowSelectable(
    item: com.notpr.emberlist.ui.components.TaskListItem,
    selectionMode: Boolean,
    selected: Boolean,
    onSelectToggle: (Boolean) -> Unit,
    onEnterSelection: () -> Unit,
    onOpen: () -> Unit,
    onReschedule: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onDelete: (com.notpr.emberlist.data.model.TaskEntity) -> Unit
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
                onToggle = { _: com.notpr.emberlist.data.model.TaskEntity -> },
                onReschedule = if (selectionMode) null else onReschedule,
                onDelete = if (selectionMode) null else onDelete,
                onClick = null
            )
        }
    }
}
