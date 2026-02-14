package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.ViewPreference
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskListItem
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun ProjectScreen(padding: PaddingValues, projectId: String, navController: androidx.navigation.NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: ProjectViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val projectFlow = remember(projectId) { viewModel.observeProject(projectId) }
    val tasksFlow = remember(projectId) { viewModel.observeTasks(projectId) }
    val sectionsFlow = remember(projectId) { viewModel.observeSections(projectId) }

    val project by projectFlow.collectAsState()
    val tasks by tasksFlow.collectAsState()
    val sections by sectionsFlow.collectAsState()
    val subtasksFlow = remember(projectId, tasks) { viewModel.observeSubtasksForParents(tasks.map { it.id }) }
    val subtasks by subtasksFlow.collectAsState(initial = emptyList())
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    val projectById = project?.let { mapOf(it.id to it) }.orEmpty()
    val sectionById = sections.associateBy { it.id }
    var projectTitle by remember(projectId) { mutableStateOf<String?>(null) }

    LaunchedEffect(project?.name) {
        val name = project?.name
        if (!name.isNullOrBlank()) {
            projectTitle = name
        }
    }

    val viewPref = project?.viewPreference ?: ViewPreference.LIST
    var dragWindowOffset by remember { mutableStateOf<Offset?>(null) }
    val columnBounds = remember { mutableStateOf<Map<String?, Rect>>(emptyMap()) }
    var showCreateSection by remember { mutableStateOf(false) }
    var showProjectMenu by remember { mutableStateOf(false) }
    var showRenameProject by remember { mutableStateOf(false) }
    var showDeleteProject by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    var rescheduleTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.TaskEntity?>(null) }

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

    Column(modifier = Modifier.padding(padding)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = projectTitle ?: "Project")
            Row {
                IconButton(onClick = {
                    val newPref = if (viewPref == ViewPreference.LIST) ViewPreference.BOARD else ViewPreference.LIST
                    project?.let { viewModel.updateProject(it.copy(viewPreference = newPref)) }
                }) {
                    Icon(
                        imageVector = if (viewPref == ViewPreference.LIST) Icons.Default.Dashboard else Icons.Default.List,
                        contentDescription = if (viewPref == ViewPreference.LIST) "Board view" else "List view"
                    )
                }
                IconButton(onClick = { showProjectMenu = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Project menu")
                }
                DropdownMenu(expanded = showProjectMenu, onDismissRequest = { showProjectMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Rename") },
                        onClick = {
                            showProjectMenu = false
                            showRenameProject = true
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(if (project?.archived == true) "Unarchive" else "Archive") },
                        onClick = {
                            showProjectMenu = false
                            project?.let { viewModel.updateProject(it.copy(archived = !it.archived)) }
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("New Section") },
                        onClick = {
                            showProjectMenu = false
                            showCreateSection = true
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Delete") },
                        onClick = {
                            showProjectMenu = false
                            showDeleteProject = true
                        }
                    )
                }
            }
        }

        if (viewPref == ViewPreference.LIST) {
            val grouped = tasks.groupBy { it.sectionId }
            val subtaskItems = subtasks.map { task ->
                buildTaskListItem(
                    task = task,
                    projectById = projectById,
                    sectionById = sectionById
                ).copy(
                    isSubtask = true,
                    indentLevel = 1,
                    sectionName = sectionById[task.sectionId]?.name ?: "No Section"
                )
            }
            LazyColumn {
                sections.forEach { section ->
                    val sectionTasks = grouped[section.id].orEmpty()
                    val parentItems = sectionTasks.map { task ->
                        buildTaskListItem(
                            task = task,
                            projectById = projectById,
                            sectionById = sectionById
                        )
                    }
                    val flatItems = flattenTaskItemsWithSubtasks(
                        parents = parentItems,
                        subtasks = subtaskItems,
                        expandedState = expanded,
                        defaultExpanded = true
                    )
                    item(key = "section-${section.id}") {
                        Text(
                            text = section.name,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                        )
                    }
                    if (sectionTasks.isEmpty()) {
                        item(key = "section-${section.id}-empty") {
                            Text(
                                text = "No tasks in this section",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                            )
                        }
                    } else {
                        items(flatItems, key = { it.task.id }) { item ->
                            TaskRow(
                                item = item,
                                showExpand = item.hasSubtasks,
                                expanded = item.isExpanded,
                                onToggleExpand = {
                                    expanded[item.task.id] = !(expanded[item.task.id] ?: true)
                                },
                                onToggle = viewModel::toggleComplete,
                                onReschedule = { rescheduleTarget = it },
                                onDelete = viewModel::deleteTask,
                                onClick = { navController.navigate("task/${item.task.id}") }
                            )
                        }
                    }
                }
                val unsectioned = grouped[null].orEmpty()
                if (unsectioned.isNotEmpty()) {
                    item(key = "section-null") {
                        Text(
                            text = "No Section",
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                        )
                    }
                    val unsectionedItems = unsectioned.map { task ->
                        buildTaskListItem(
                            task = task,
                            projectById = projectById,
                            sectionById = sectionById
                        ).copy(sectionName = "No Section")
                    }
                    val flatUnsectioned = flattenTaskItemsWithSubtasks(
                        parents = unsectionedItems,
                        subtasks = subtaskItems,
                        expandedState = expanded,
                        defaultExpanded = true
                    )
                    items(flatUnsectioned, key = { it.task.id }) { item ->
                        TaskRow(
                            item = item,
                            showExpand = item.hasSubtasks,
                            expanded = item.isExpanded,
                            onToggleExpand = {
                                expanded[item.task.id] = !(expanded[item.task.id] ?: true)
                            },
                            onToggle = viewModel::toggleComplete,
                            onReschedule = { rescheduleTarget = it },
                            onDelete = viewModel::deleteTask,
                            onClick = { navController.navigate("task/${item.task.id}") }
                        )
                    }
                }
            }
        } else {
            val grouped = tasks.groupBy { it.sectionId }
            LazyRow {
                items(sections, key = { it.id }) { section ->
                    BoardColumn(
                        title = section.name,
                        sectionId = section.id,
                        tasks = grouped[section.id].orEmpty(),
                        projectById = projectById,
                        sectionById = sectionById,
                        onToggle = viewModel::toggleComplete,
                        onReschedule = { rescheduleTarget = it },
                        onDelete = viewModel::deleteTask,
                        onNavigate = { taskId -> navController.navigate("task/$taskId") },
                        onColumnBounds = { rect ->
                            columnBounds.value = columnBounds.value + (section.id to rect)
                        },
                        onDragLocation = { dragWindowOffset = it },
                        onDrop = { task ->
                            val target = dropTarget(columnBounds.value, dragWindowOffset)
                            if (target != null && target != task.sectionId) {
                                val newOrder = (grouped[target]?.maxOfOrNull { it.order } ?: 0) + 1
                                viewModel.moveTaskToSection(task, target, newOrder)
                            }
                        }
                    )
                }
                item {
                    BoardColumn(
                        title = "No Section",
                        sectionId = null,
                        tasks = grouped[null].orEmpty(),
                        projectById = projectById,
                        sectionById = sectionById,
                        onToggle = viewModel::toggleComplete,
                        onReschedule = { rescheduleTarget = it },
                        onDelete = viewModel::deleteTask,
                        onNavigate = { taskId -> navController.navigate("task/$taskId") },
                        onColumnBounds = { rect ->
                            columnBounds.value = columnBounds.value + (null to rect)
                        },
                        onDragLocation = { dragWindowOffset = it },
                        onDrop = { task ->
                            val target = dropTarget(columnBounds.value, dragWindowOffset)
                            if (target != null && target != task.sectionId) {
                                val newOrder = (grouped[target]?.maxOfOrNull { it.order } ?: 0) + 1
                                viewModel.moveTaskToSection(task, target, newOrder)
                            }
                        }
                    )
                }
            }
        }
    }

    if (showCreateSection) {
        SectionDialog(
            title = "Create Section",
            initial = "",
            onDismiss = { showCreateSection = false },
            onSave = {
                val name = it.trim()
                if (name.isNotBlank()) {
                    viewModel.createSection(projectId, name)
                }
                showCreateSection = false
            }
        )
    }

    if (showDeleteProject) {
        AlertDialog(
            onDismissRequest = { showDeleteProject = false },
            title = { Text("Delete project") },
            text = { Text("Delete \"${projectTitle ?: "Project"}\" and its tasks?") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteProject(projectId)
                    showDeleteProject = false
                    navController.popBackStack()
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteProject = false }) { Text("Cancel") }
            }
        )
    }

    if (showRenameProject) {
        val currentName = project?.name.orEmpty()
        ProjectNameDialog(
            title = "Rename Project",
            initial = currentName,
            onDismiss = { showRenameProject = false },
            onSave = { name ->
                if (name.isNotBlank()) {
                    project?.let { viewModel.updateProject(it.copy(name = name.trim())) }
                }
                showRenameProject = false
            }
        )
    }
}

@Composable
private fun BoardColumn(
    title: String,
    sectionId: String?,
    tasks: List<com.notpr.emberlist.data.model.TaskEntity>,
    projectById: Map<String, com.notpr.emberlist.data.model.ProjectEntity>,
    sectionById: Map<String, com.notpr.emberlist.data.model.SectionEntity>,
    onToggle: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onReschedule: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onDelete: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onNavigate: (String) -> Unit,
    onColumnBounds: (Rect) -> Unit,
    onDragLocation: (Offset) -> Unit,
    onDrop: (com.notpr.emberlist.data.model.TaskEntity) -> Unit
) {
    Column(
        modifier = Modifier
            .width(280.dp)
            .padding(8.dp)
            .onGloballyPositioned { coords -> onColumnBounds(coords.boundsInWindow()) }
    ) {
        Text(text = title, modifier = Modifier.padding(8.dp))
        tasks.forEach { task ->
            DraggableTask(
                task = task,
                projectById = projectById,
                sectionById = sectionById,
                onToggle = onToggle,
                onReschedule = onReschedule,
                onDelete = onDelete,
                onClick = { onNavigate(task.id) },
                onDragLocation = onDragLocation,
                onDrop = onDrop
            )
        }
    }
}

@Composable
private fun DraggableTask(
    task: com.notpr.emberlist.data.model.TaskEntity,
    projectById: Map<String, com.notpr.emberlist.data.model.ProjectEntity>,
    sectionById: Map<String, com.notpr.emberlist.data.model.SectionEntity>,
    onToggle: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onReschedule: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onDelete: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
    onClick: () -> Unit,
    onDragLocation: (Offset) -> Unit,
    onDrop: (com.notpr.emberlist.data.model.TaskEntity) -> Unit
) {
    var coords: LayoutCoordinates? by remember { mutableStateOf(null) }
    Box(
        modifier = Modifier
            .onGloballyPositioned { coords = it }
            .pointerInput(task.id) {
                detectDragGestures(
                    onDrag = { change, _ ->
                        val layout = coords ?: return@detectDragGestures
                        val windowOffset = layout.localToWindow(change.position)
                        onDragLocation(windowOffset)
                        change.consume()
                    },
                    onDragEnd = { onDrop(task) }
                )
            }
    ) {
        val item = buildTaskListItem(
            task = task,
            projectById = projectById,
            sectionById = sectionById
        )
        TaskRow(
            item = item,
            onToggle = onToggle,
            onReschedule = onReschedule,
            onDelete = onDelete,
            onClick = onClick
        )
    }
}

private fun dropTarget(bounds: Map<String?, Rect>, offset: Offset?): String? {
    if (offset == null) return null
    return bounds.entries.firstOrNull { it.value.contains(offset) }?.key
}

@Composable
private fun SectionDialog(
    title: String,
    initial: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(value) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun ProjectNameDialog(
    title: String,
    initial: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var value by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(value) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
