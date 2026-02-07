package com.notpr.emberlist.ui.screens.quickadd

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.parsing.QuickAddResult
import com.notpr.emberlist.parsing.ReminderSpec
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickAddSheet() {
    var open by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val container = LocalAppContainer.current
    val viewModel: QuickAddViewModel = viewModel(factory = EmberlistViewModelFactory(container))

    FloatingActionButton(onClick = { open = true }) {
        androidx.compose.material3.Icon(Icons.Default.Add, contentDescription = "Quick Add")
    }

    if (open) {
        ModalBottomSheet(
            onDismissRequest = { open = false },
            sheetState = sheetState
        ) {
            val input by viewModel.input.collectAsState()
            val parsed by viewModel.parsed.collectAsState()
            val projects by viewModel.projects.collectAsState()
            val context = LocalContext.current
            val zone = ZoneId.systemDefault()

            var showPriorityDialog by remember { mutableStateOf(false) }
            var showProjectDialog by remember { mutableStateOf(false) }
            var showRecurrenceDialog by remember { mutableStateOf(false) }
            var showReminderDialog by remember { mutableStateOf(false) }

            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Quick Add")
                OutlinedTextField(
                    value = input,
                    onValueChange = viewModel::updateInput,
                    placeholder = { Text("e.g. Pay rent tomorrow 8am #Home p1") },
                    modifier = Modifier.fillMaxWidth()
                )
                ParsedChips(
                    parsed = parsed,
                    onDueClick = {
                        pickDateTime(context, zone) { viewModel.setDueOverride(it) }
                    },
                    onDeadlineClick = {
                        pickDateTime(context, zone) { viewModel.setDeadlineOverride(it) }
                    },
                    onPriorityClick = { showPriorityDialog = true },
                    onProjectClick = { showProjectDialog = true },
                    onRecurrenceClick = { showRecurrenceDialog = true },
                    onReminderClick = { showReminderDialog = true }
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    AssistChip(
                        onClick = { viewModel.saveTask { open = false } },
                        label = { Text("Add") }
                    )
                }
            }

            if (showPriorityDialog) {
                PriorityDialog(
                    current = parsed.priority,
                    onDismiss = { showPriorityDialog = false },
                    onSelect = {
                        viewModel.setPriorityOverride(it)
                        showPriorityDialog = false
                    }
                )
            }

            if (showProjectDialog) {
                ProjectDialog(
                    current = parsed.projectName,
                    projects = projects.map { it.name },
                    onDismiss = { showProjectDialog = false },
                    onSelect = {
                        viewModel.setProjectOverride(it)
                        showProjectDialog = false
                    }
                )
            }

            if (showRecurrenceDialog) {
                RecurrenceDialog(
                    current = parsed.recurrenceRule.orEmpty(),
                    onDismiss = { showRecurrenceDialog = false },
                    onSave = {
                        viewModel.setRecurrenceOverride(it.ifBlank { null })
                        showRecurrenceDialog = false
                    }
                )
            }

            if (showReminderDialog) {
                ReminderDialog(
                    onDismiss = { showReminderDialog = false },
                    onSetAbsolute = {
                        viewModel.setRemindersOverride(listOf(ReminderSpec.Absolute(it)))
                        showReminderDialog = false
                    },
                    onSetOffset = {
                        viewModel.setRemindersOverride(listOf(ReminderSpec.Offset(it)))
                        showReminderDialog = false
                    }
                )
            }
        }
    }
}

@Composable
private fun ParsedChips(
    parsed: QuickAddResult,
    onDueClick: () -> Unit,
    onDeadlineClick: () -> Unit,
    onPriorityClick: () -> Unit,
    onProjectClick: () -> Unit,
    onRecurrenceClick: () -> Unit,
    onReminderClick: () -> Unit
) {
    val zone = ZoneId.systemDefault()
    val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            parsed.dueAt?.let {
                val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                AssistChip(onClick = onDueClick, label = { Text("Due ${dt.format(formatter)}") })
            } ?: AssistChip(onClick = onDueClick, label = { Text("Set due") })
            parsed.deadlineAt?.let {
                val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                AssistChip(onClick = onDeadlineClick, label = { Text("Deadline ${dt.format(formatter)}") })
            } ?: AssistChip(onClick = onDeadlineClick, label = { Text("Set deadline") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            AssistChip(onClick = onPriorityClick, label = { Text(parsed.priority.name) })
            AssistChip(onClick = onProjectClick, label = { Text(parsed.projectName?.let { "#${it}" } ?: "Inbox") })
        }
        parsed.recurrenceRule?.let {
            AssistChip(onClick = onRecurrenceClick, label = { Text("Repeat") })
        } ?: AssistChip(onClick = onRecurrenceClick, label = { Text("Add repeat") })
        AssistChip(onClick = onReminderClick, label = { Text("Reminders") })
    }
}

private fun pickDateTime(
    context: android.content.Context,
    zone: ZoneId,
    onPicked: (Long) -> Unit
) {
    val now = LocalDateTime.now(zone)
    DatePickerDialog(
        context,
        { _, year, month, day ->
            val pickedDate = LocalDate.of(year, month + 1, day)
            TimePickerDialog(
                context,
                { _, hour, minute ->
                    val instant = LocalDateTime.of(pickedDate, LocalTime.of(hour, minute))
                        .atZone(zone).toInstant().toEpochMilli()
                    onPicked(instant)
                },
                now.hour,
                now.minute,
                false
            ).show()
        },
        now.year,
        now.monthValue - 1,
        now.dayOfMonth
    ).show()
}

@Composable
private fun PriorityDialog(
    current: Priority,
    onDismiss: () -> Unit,
    onSelect: (Priority) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Priority") },
        text = {
            Column {
                Priority.values().forEach { item ->
                    TextButton(onClick = { onSelect(item) }) {
                        Text(item.name)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
private fun ProjectDialog(
    current: String?,
    projects: List<String>,
    onDismiss: () -> Unit,
    onSelect: (String?) -> Unit
) {
    var newProject by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Project") },
        text = {
            Column {
                TextButton(onClick = { onSelect(null) }) { Text("Inbox") }
                projects.forEach { name ->
                    TextButton(onClick = { onSelect(name) }) { Text(name) }
                }
                OutlinedTextField(
                    value = newProject,
                    onValueChange = { newProject = it },
                    label = { Text("Create project") },
                    modifier = Modifier.fillMaxWidth()
                )
                if (newProject.isNotBlank()) {
                    TextButton(onClick = { onSelect(newProject.trim()) }) {
                        Text("Create \"${newProject.trim()}\"")
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
private fun RecurrenceDialog(
    current: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var text by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Recurrence") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("RRULE subset") },
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(text) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun ReminderDialog(
    onDismiss: () -> Unit,
    onSetAbsolute: (Long) -> Unit,
    onSetOffset: (Int) -> Unit
) {
    var offsetText by remember { mutableStateOf("30") }
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reminder") },
        text = {
            Column {
                TextButton(onClick = {
                    pickDateTime(context, zone) { onSetAbsolute(it) }
                }) { Text("Set exact time") }
                OutlinedTextField(
                    value = offsetText,
                    onValueChange = { offsetText = it },
                    label = { Text("Offset minutes") },
                    modifier = Modifier.fillMaxWidth()
                )
                TextButton(onClick = {
                    val minutes = offsetText.toIntOrNull() ?: 30
                    onSetOffset(minutes)
                }) { Text("Set offset") }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}
