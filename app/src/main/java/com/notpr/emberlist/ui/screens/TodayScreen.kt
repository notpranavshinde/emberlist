package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileMove
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.DragToSubtaskState
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TodayScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TodayViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val settingsViewModel: SettingsViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val parentItems by viewModel.tasks.collectAsState()
    val subtaskItems by viewModel.subtasks.collectAsState()
    val completedItems by viewModel.completedToday.collectAsState()
    val settings by settingsViewModel.settings.collectAsState()
    val zone = ZoneId.systemDefault()
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    val reorderState = remember { TodayManualReorderState() }
    var sortMode by rememberSaveable { mutableStateOf(TodaySortMode.MANUAL.name) }
    var groupMode by rememberSaveable { mutableStateOf(TodayGroupMode.NONE.name) }
    var showOrganizeDialog by remember { mutableStateOf(false) }
    var manualTodayOrderIds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var selectionMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateOf(setOf<String>()) }
    val sortedParents = remember(parentItems, sortMode) {
        sortTodayItems(parentItems, TodaySortMode.valueOf(sortMode))
    }
    val overdueParents = sortedParents.filter { it.isOverdue }
    val todayParents = sortedParents.filterNot { it.isOverdue }
    val manualTodayBaseIds = remember(todayParents) { todayParents.map { it.task.id } }
    LaunchedEffect(manualTodayBaseIds, sortMode, groupMode) {
        manualTodayOrderIds = reconcileManualOrder(manualTodayOrderIds, manualTodayBaseIds)
    }
    val canManualReorder = !selectionMode &&
        TodaySortMode.valueOf(sortMode) == TodaySortMode.MANUAL &&
        TodayGroupMode.valueOf(groupMode) == TodayGroupMode.NONE
    val todayDisplayParents = remember(todayParents, manualTodayOrderIds, canManualReorder) {
        if (canManualReorder) {
            applyManualOrder(todayParents, manualTodayOrderIds)
        } else {
            todayParents
        }
    }
    val overdue = flattenTaskItemsWithSubtasks(
        parents = overdueParents,
        subtasks = subtaskItems,
        expandedState = expanded,
        defaultExpanded = false
    )
    val todayGroups = remember(todayDisplayParents, subtaskItems, groupMode) {
        buildTodayGroups(
            parents = todayDisplayParents,
            subtasks = subtaskItems,
            expandedState = expanded,
            groupMode = TodayGroupMode.valueOf(groupMode),
            zone = zone
        )
    }
    val completedToday = flattenTaskItemsWithSubtasks(
        parents = completedItems,
        subtasks = subtaskItems,
        expandedState = expanded,
        defaultExpanded = false
    )
    val dragState = remember { DragToSubtaskState() }
    val context = LocalContext.current
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }
    var rescheduleOverdue by remember { mutableStateOf(false) }
    var rescheduleSelected by remember { mutableStateOf(false) }
    var showPriorityPicker by remember { mutableStateOf(false) }
    var showProjectPicker by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var completedExpanded by remember { mutableStateOf(false) }
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
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = ListHorizontalPadding, vertical = ListHeaderVerticalPadding),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(text = "Today", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        text = "${parentItems.size} tasks",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
                IconButton(onClick = { showOrganizeDialog = true }) {
                    Icon(Icons.Default.Tune, contentDescription = "Sort and group")
                }
            }
        }
        if (selectionMode) {
            item(key = "bulk_actions") {
                LazyRow(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = ListHorizontalPadding, vertical = ListControlsVerticalPadding),
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
                    modifier = Modifier.fillMaxWidth().padding(
                        horizontal = ListHorizontalPadding,
                        vertical = ListSectionHeaderVerticalPadding
                    ),
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
                    onDelete = viewModel::deleteTask,
                    dragState = if (canManualReorder) null else dragState,
                    onDropAsSubtask = if (canManualReorder) null else viewModel::makeSubtask,
                    reorderEnabled = false,
                    onManualSubtask = null
                )
            }
        }
        todayGroups.forEach { group ->
            if (group.title != null) {
                item(key = "today-group-${group.title}") {
                    Text(
                        text = group.title,
                        modifier = Modifier.padding(horizontal = ListHorizontalPadding, vertical = ListSectionHeaderVerticalPadding),
                        style = MaterialTheme.typography.titleSmall
                    )
                }
            }
            items(group.items, key = { it.task.id }) { item ->
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
                    onDelete = viewModel::deleteTask,
                    dragState = if (canManualReorder) null else dragState,
                    onDropAsSubtask = if (canManualReorder) null else viewModel::makeSubtask,
                    reorderEnabled = canManualReorder && !item.isSubtask,
                    reorderState = reorderState,
                    onReorderMove = { draggedId, targetId ->
                        manualTodayOrderIds = moveTaskId(manualTodayOrderIds, draggedId, targetId)
                    },
                    onReorderCommit = {
                        viewModel.reorderTodayTasks(manualTodayOrderIds)
                    },
                    onManualSubtask = { draggedId, parentId ->
                        val draggedTask = todayDisplayParents.firstOrNull { it.task.id == draggedId }?.task
                        val parentTask = todayDisplayParents.firstOrNull { it.task.id == parentId }?.task
                        if (draggedTask != null && parentTask != null) {
                            viewModel.makeSubtask(draggedTask, parentTask)
                        }
                    }
                )
            }
        }
        if (settings.showCompletedToday && completedToday.isNotEmpty()) {
            item(key = "completed_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = ListHorizontalPadding, vertical = ListSectionHeaderVerticalPadding)
                        .clickable { completedExpanded = !completedExpanded },
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Completed today (${completedToday.size})",
                        style = MaterialTheme.typography.titleSmall
                    )
                    Icon(
                        imageVector = if (completedExpanded) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowRight,
                        contentDescription = if (completedExpanded) "Collapse" else "Expand"
                    )
                }
            }
            if (completedExpanded) {
                items(completedToday, key = { it.task.id }) { item ->
                    TaskRowSelectable(
                        item = item,
                        selectionMode = selectionMode,
                        selected = selectedIds.value.contains(item.task.id),
                        onSelectToggle = { checked ->
                            selectedIds.value =
                                if (checked) selectedIds.value + item.task.id else selectedIds.value - item.task.id
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
                        onDelete = viewModel::deleteTask,
                        dragState = if (canManualReorder) null else dragState,
                        onDropAsSubtask = if (canManualReorder) null else viewModel::makeSubtask,
                        reorderEnabled = false,
                        onManualSubtask = null
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

    if (showOrganizeDialog) {
        AlertDialog(
            onDismissRequest = { showOrganizeDialog = false },
            title = { Text("Organize Today") },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(text = "Sort", style = MaterialTheme.typography.titleSmall)
                    TodaySortMode.entries.forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { sortMode = option.name },
                            horizontalArrangement = Arrangement.Start
                        ) {
                            RadioButton(
                                selected = sortMode == option.name,
                                onClick = { sortMode = option.name }
                            )
                            Text(
                                text = option.label,
                                modifier = Modifier.padding(start = 12.dp, top = 12.dp)
                            )
                        }
                    }
                    Text(text = "Group", style = MaterialTheme.typography.titleSmall)
                    TodayGroupMode.entries.forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { groupMode = option.name },
                            horizontalArrangement = Arrangement.Start
                        ) {
                            RadioButton(
                                selected = groupMode == option.name,
                                onClick = { groupMode = option.name }
                            )
                            Text(
                                text = option.label,
                                modifier = Modifier.padding(start = 12.dp, top = 12.dp)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showOrganizeDialog = false }) {
                    Text("Done")
                }
            }
        )
    }
}

private enum class TodaySortMode(val label: String) {
    MANUAL("Manual"),
    NAME("Name"),
    DATE("Date"),
    DEADLINE("Deadline"),
    PRIORITY("Priority"),
    PROJECT("Project")
}

private enum class TodayGroupMode(val label: String) {
    NONE("None"),
    DATE("Date"),
    DEADLINE("Deadline"),
    PRIORITY("Priority")
    ,
    PROJECT("Projects")
}

private data class TodayGroup(
    val title: String?,
    val items: List<TaskListItem>
)

private sealed interface TodayManualDragResult {
    data object None : TodayManualDragResult
    data object Reordered : TodayManualDragResult
    data class MakeSubtask(val draggedId: String, val parentId: String) : TodayManualDragResult
}

private class TodayManualReorderState {
    private val itemBounds = mutableStateMapOf<String, Rect>()
    private var dragPointerY by mutableStateOf(0f)
    private var totalDx by mutableStateOf(0f)
    private var draggingTaskId by mutableStateOf<String?>(null)
    private var hoverTargetId by mutableStateOf<String?>(null)
    private var moved by mutableStateOf(false)

    fun updateBounds(taskId: String, bounds: Rect) {
        itemBounds[taskId] = bounds
    }

    fun startDrag(taskId: String, startY: Float) {
        draggingTaskId = taskId
        dragPointerY = startY
        totalDx = 0f
        hoverTargetId = null
        moved = false
    }

    fun updateDrag(
        deltaX: Float,
        deltaY: Float,
        subtaskThresholdPx: Float,
        reorderSnapPaddingPx: Float,
        onMove: (draggedId: String, targetId: String) -> Unit
    ) {
        val draggedId = draggingTaskId ?: return
        totalDx += deltaX
        dragPointerY += deltaY
        val targetId = itemBounds.entries.firstOrNull { (taskId, bounds) ->
            taskId != draggedId && dragPointerY in (bounds.top - reorderSnapPaddingPx)..(bounds.bottom + reorderSnapPaddingPx)
        }?.key ?: return
        hoverTargetId = targetId
        if (totalDx > -subtaskThresholdPx) {
            moved = true
            onMove(draggedId, targetId)
        }
    }

    fun endDrag(subtaskThresholdPx: Float): TodayManualDragResult {
        val draggedId = draggingTaskId
        val targetId = hoverTargetId
        val result = when {
            draggedId != null && targetId != null && totalDx <= -subtaskThresholdPx ->
                TodayManualDragResult.MakeSubtask(draggedId, targetId)
            moved -> TodayManualDragResult.Reordered
            else -> TodayManualDragResult.None
        }
        draggingTaskId = null
        totalDx = 0f
        hoverTargetId = null
        moved = false
        return result
    }

    fun cancelDrag() {
        draggingTaskId = null
        totalDx = 0f
        hoverTargetId = null
        moved = false
    }

    fun isDragging(taskId: String): Boolean = draggingTaskId == taskId
    fun isAnyDragging(): Boolean = draggingTaskId != null
}

private fun sortTodayItems(
    items: List<TaskListItem>,
    mode: TodaySortMode
): List<TaskListItem> {
    return when (mode) {
        TodaySortMode.MANUAL -> items.sortedWith(
            compareBy<TaskListItem> { it.task.order }
                .thenBy { it.displayDueAt ?: Long.MAX_VALUE }
                .thenBy { it.task.title.lowercase() }
        )
        TodaySortMode.NAME -> items.sortedBy { it.task.title.lowercase() }
        TodaySortMode.DATE -> items.sortedWith(compareBy<TaskListItem> { it.displayDueAt ?: Long.MAX_VALUE }.thenBy { it.task.title.lowercase() })
        TodaySortMode.DEADLINE -> items.sortedWith(compareBy<TaskListItem> { it.task.deadlineAt ?: Long.MAX_VALUE }.thenBy { it.task.title.lowercase() })
        TodaySortMode.PRIORITY -> items.sortedWith(compareBy<TaskListItem> { it.task.priority.ordinal }.thenBy { it.task.title.lowercase() })
        TodaySortMode.PROJECT -> items.sortedWith(compareBy<TaskListItem> {
            if (it.projectName.isBlank()) "inbox" else it.projectName.lowercase()
        }.thenBy { it.task.title.lowercase() })
    }
}

private fun buildTodayGroups(
    parents: List<TaskListItem>,
    subtasks: List<TaskListItem>,
    expandedState: MutableMap<String, Boolean>,
    groupMode: TodayGroupMode,
    zone: ZoneId
): List<TodayGroup> {
    if (groupMode == TodayGroupMode.NONE) {
        return listOf(
            TodayGroup(
                title = null,
                items = flattenTaskItemsWithSubtasks(
                    parents = parents,
                    subtasks = subtasks,
                    expandedState = expandedState,
                    defaultExpanded = false
                )
            )
        )
    }

    val dateFormatter = DateTimeFormatter.ofPattern("EEE, MMM d")
    val grouped = when (groupMode) {
        TodayGroupMode.DATE -> parents.groupBy {
            it.displayDueAt?.let { due ->
                Instant.ofEpochMilli(due).atZone(zone).toLocalDate().format(dateFormatter)
            } ?: "No date"
        }
        TodayGroupMode.DEADLINE -> parents.groupBy {
            it.task.deadlineAt?.let { deadline ->
                Instant.ofEpochMilli(deadline).atZone(zone).toLocalDate().format(dateFormatter)
            } ?: "No deadline"
        }
        TodayGroupMode.PRIORITY -> parents.groupBy { it.task.priority.name }
        TodayGroupMode.PROJECT -> parents.groupBy { if (it.projectName.isBlank()) "Inbox" else it.projectName }
        TodayGroupMode.NONE -> error("Handled above")
    }

    return grouped.entries.map { (title, groupParents) ->
        TodayGroup(
            title = title,
            items = flattenTaskItemsWithSubtasks(
                parents = groupParents,
                subtasks = subtasks,
                expandedState = expandedState,
                defaultExpanded = false
            )
        )
    }
}

private fun reconcileManualOrder(existing: List<String>, current: List<String>): List<String> {
    if (current.isEmpty()) return emptyList()
    val currentSet = current.toSet()
    val kept = existing.filter { it in currentSet }
    val appended = current.filterNot { it in kept }
    return kept + appended
}

private fun applyManualOrder(
    parents: List<TaskListItem>,
    orderedIds: List<String>
): List<TaskListItem> {
    val byId = parents.associateBy { it.task.id }
    return orderedIds.mapNotNull { byId[it] } + parents.filterNot { it.task.id in orderedIds.toSet() }
}

private fun moveTaskId(
    orderedIds: List<String>,
    draggedId: String,
    targetId: String
): List<String> {
    val mutable = orderedIds.toMutableList()
    val fromIndex = mutable.indexOf(draggedId)
    val targetIndex = mutable.indexOf(targetId)
    if (fromIndex == -1 || targetIndex == -1 || fromIndex == targetIndex) return orderedIds
    mutable.removeAt(fromIndex)
    val insertIndex = if (fromIndex < targetIndex) targetIndex - 1 else targetIndex
    mutable.add(insertIndex, draggedId)
    return mutable.toList()
}

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
    onToggleExpand: () -> Unit,
    dragState: DragToSubtaskState?,
    onDropAsSubtask: ((com.notpr.emberlist.data.model.TaskEntity, com.notpr.emberlist.data.model.TaskEntity) -> Unit)?,
    reorderEnabled: Boolean,
    reorderState: TodayManualReorderState? = null,
    onReorderMove: ((String, String) -> Unit)? = null,
    onReorderCommit: (() -> Unit)? = null,
    onManualSubtask: ((String, String) -> Unit)? = null
) {
    val isDragged = reorderState?.isDragging(item.task.id) == true
    val dimOthers = reorderEnabled && reorderState?.isAnyDragging() == true && !isDragged
    val modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = ListHorizontalPadding, vertical = ListTaskOuterVerticalPadding)
        .alpha(
            when {
                isDragged -> 1f
                dimOthers -> 0.4f
                else -> 1f
            }
        )
        .background(
            if (isDragged) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.45f)
            else MaterialTheme.colorScheme.background
        )
        .then(
            if (reorderEnabled && reorderState != null) {
                Modifier.onGloballyPositioned { coords ->
                    reorderState.updateBounds(item.task.id, coords.boundsInWindow())
                }
            } else {
                Modifier
            }
        )
    Row(modifier = modifier) {
        if (selectionMode) {
            androidx.compose.material3.Checkbox(checked = selected, onCheckedChange = null)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = if (selectionMode) 8.dp else 0.dp)
                .pointerInput(selectionMode, selected, item.task.id) {
                    detectTapGestures(
                        onTap = {
                            if (selectionMode) onSelectToggle(!selected) else onOpen()
                        },
                        onLongPress = {
                            if (!selectionMode) onEnterSelection()
                        }
                    )
                }
        ) {
            TaskRow(
                item = item,
                onToggle = if (selectionMode) ({ _: com.notpr.emberlist.data.model.TaskEntity -> }) else onToggle,
                onReschedule = if (selectionMode) null else onReschedule,
                onDelete = if (selectionMode) null else onDelete,
                onClick = null,
                showExpand = showExpand,
                expanded = expanded,
                onToggleExpand = onToggleExpand,
                dragState = dragState,
                onDropAsSubtask = onDropAsSubtask
            )
        }
        if (reorderEnabled && reorderState != null && onReorderMove != null && onReorderCommit != null) {
            ManualReorderHandle(
                taskId = item.task.id,
                reorderState = reorderState,
                onReorderMove = onReorderMove,
                onReorderCommit = onReorderCommit,
                onManualSubtask = onManualSubtask
            )
        }
    }
}

@Composable
private fun ManualReorderHandle(
    taskId: String,
    reorderState: TodayManualReorderState,
    onReorderMove: (String, String) -> Unit,
    onReorderCommit: () -> Unit,
    onManualSubtask: ((String, String) -> Unit)?
) {
    var handleCoords by remember { mutableStateOf<androidx.compose.ui.layout.LayoutCoordinates?>(null) }
    val density = LocalDensity.current
    val subtaskThresholdPx = with(density) { 56.dp.toPx() }
    val reorderSnapPaddingPx = with(density) { 18.dp.toPx() }
    Box(
        modifier = Modifier
            .padding(start = 4.dp, top = 2.dp)
            .width(40.dp)
            .size(40.dp)
            .onGloballyPositioned { handleCoords = it }
            .pointerInput(taskId) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { offset ->
                        val coords = handleCoords ?: return@detectDragGesturesAfterLongPress
                        reorderState.startDrag(taskId, coords.localToWindow(offset).y)
                    },
                    onDragEnd = {
                        when (val result = reorderState.endDrag(subtaskThresholdPx)) {
                            TodayManualDragResult.None -> Unit
                            TodayManualDragResult.Reordered -> onReorderCommit()
                            is TodayManualDragResult.MakeSubtask -> {
                                onManualSubtask?.invoke(result.draggedId, result.parentId)
                            }
                        }
                    },
                    onDragCancel = { reorderState.cancelDrag() },
                    onDrag = { change, dragAmount ->
                        reorderState.updateDrag(
                            deltaX = dragAmount.x,
                            deltaY = dragAmount.y,
                            subtaskThresholdPx = subtaskThresholdPx,
                            reorderSnapPaddingPx = reorderSnapPaddingPx,
                            onMove = onReorderMove
                        )
                        change.consume()
                    }
                )
            }
    ) {
        Text(
            text = "\u22EE\u22EE",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f)
        )
    }
}
