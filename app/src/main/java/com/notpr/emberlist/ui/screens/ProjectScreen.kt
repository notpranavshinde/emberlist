package com.notpr.emberlist.ui.screens

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.ViewPreference
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow

@Composable
fun ProjectScreen(padding: PaddingValues, projectId: String, navController: androidx.navigation.NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: ProjectViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val project by viewModel.observeProject(projectId).collectAsState()
    val tasks by viewModel.observeTasks(projectId).collectAsState()
    val sections by viewModel.observeSections(projectId).collectAsState()

    var viewPref by remember(project?.viewPreference) { mutableStateOf(project?.viewPreference ?: ViewPreference.LIST) }
    var dragWindowOffset by remember { mutableStateOf<Offset?>(null) }
    val columnBounds = remember { mutableStateOf<Map<String?, Rect>>(emptyMap()) }
    var showCreateSection by remember { mutableStateOf(false) }
    var renameSectionTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.SectionEntity?>(null) }
    var deleteSectionTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.SectionEntity?>(null) }

    Column(modifier = Modifier.padding(padding)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = project?.name ?: "Project")
            Button(onClick = {
                viewPref = if (viewPref == ViewPreference.LIST) ViewPreference.BOARD else ViewPreference.LIST
                project?.let { viewModel.updateProject(it.copy(viewPreference = viewPref)) }
            }) {
                Text(text = if (viewPref == ViewPreference.LIST) "Board" else "List")
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = "Sections")
            Button(onClick = { showCreateSection = true }) { Text("New Section") }
        }
        sections.forEach { section ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = section.name)
                Row {
                    TextButton(onClick = { renameSectionTarget = section }) { Text("Rename") }
                    TextButton(onClick = { deleteSectionTarget = section }) { Text("Delete") }
                }
            }
        }

        if (viewPref == ViewPreference.LIST) {
            LazyColumn {
                items(tasks, key = { it.id }) { task ->
                    TaskRow(
                        task = task,
                        onToggle = viewModel::toggleComplete,
                        onClick = { navController.navigate("task/${task.id}") }
                    )
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
                        onToggle = viewModel::toggleComplete,
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
                        onToggle = viewModel::toggleComplete,
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

    renameSectionTarget?.let { target ->
        SectionDialog(
            title = "Rename Section",
            initial = target.name,
            onDismiss = { renameSectionTarget = null },
            onSave = {
                val name = it.trim()
                if (name.isNotBlank()) {
                    viewModel.renameSection(target, name)
                }
                renameSectionTarget = null
            }
        )
    }

    deleteSectionTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteSectionTarget = null },
            title = { Text("Delete Section") },
            text = { Text("Delete section \"${target.name}\"? Tasks will remain but become unsectioned.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteSection(target)
                    deleteSectionTarget = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { deleteSectionTarget = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun BoardColumn(
    title: String,
    sectionId: String?,
    tasks: List<com.notpr.emberlist.data.model.TaskEntity>,
    onToggle: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
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
                onToggle = onToggle,
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
    onToggle: (com.notpr.emberlist.data.model.TaskEntity) -> Unit,
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
        TaskRow(task = task, onToggle = onToggle, onClick = onClick)
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
