package com.notpr.emberlist.ui.screens.quickadd

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.window.PopupProperties
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
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
            val projectNames = projects.map { it.name }
            var inputState by remember { mutableStateOf(TextFieldValue(input)) }
            var projectMenuOpen by remember { mutableStateOf(false) }
            val projectQuery = remember(inputState.text) {
                val hashIndex = inputState.text.lastIndexOf('#')
                if (hashIndex == -1) return@remember null
                val after = inputState.text.substring(hashIndex + 1)
                val token = after.takeWhile { !it.isWhitespace() }
                token
            }
            val shouldSuggest = projectQuery != null
            val projectMatches = remember(projectQuery, projectNames) {
                val query = projectQuery?.trim().orEmpty()
                if (projectQuery == null) emptyList()
                else if (query.isBlank()) projectNames
                else projectNames.filter { it.contains(query, ignoreCase = true) }
            }

            var showPriorityDialog by remember { mutableStateOf(false) }
            var showProjectDialog by remember { mutableStateOf(false) }
            var showRecurrenceDialog by remember { mutableStateOf(false) }
            var showDeadlineRecurrenceDialog by remember { mutableStateOf(false) }
            var showReminderDialog by remember { mutableStateOf(false) }

            LaunchedEffect(input) {
                if (inputState.text != input) {
                    inputState = inputState.copy(text = input, selection = TextRange(input.length))
                }
            }

            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Quick Add")
                Box {
                    OutlinedTextField(
                        value = inputState,
                        onValueChange = { value ->
                            inputState = value
                            viewModel.updateInput(value.text)
                            projectMenuOpen = value.text.lastIndexOf('#') != -1
                        },
                        placeholder = { Text("e.g. Pay rent tomorrow 8am #Home p1") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .onFocusChanged { focusState ->
                                projectMenuOpen = focusState.isFocused && shouldSuggest
                            }
                    )
                    DropdownMenu(
                        expanded = projectMenuOpen && shouldSuggest,
                        onDismissRequest = { projectMenuOpen = false },
                        properties = PopupProperties(focusable = false),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        projectMatches.forEach { name ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    val currentText = inputState.text
                                    val hashIndex = currentText.lastIndexOf('#')
                                    if (hashIndex != -1) {
                                        val before = currentText.substring(0, hashIndex + 1)
                                        val after = currentText.substring(hashIndex + 1)
                                        val remainder = after.dropWhile { !it.isWhitespace() }
                                        val spacer = if (remainder.isEmpty()) " " else ""
                                        val newText = "$before$name$spacer$remainder"
                                        val cursor = (before.length + name.length + spacer.length)
                                        inputState = TextFieldValue(newText, selection = TextRange(cursor))
                                        viewModel.updateInput(newText)
                                        viewModel.setProjectOverride(name)
                                        projectMenuOpen = false
                                    }
                                }
                            )
                        }
                    }
                }
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
                    onDeadlineRecurrenceClick = { showDeadlineRecurrenceDialog = true },
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

            if (showDeadlineRecurrenceDialog) {
                RecurrenceDialog(
                    current = parsed.deadlineRecurringRule.orEmpty(),
                    onDismiss = { showDeadlineRecurrenceDialog = false },
                    onSave = {
                        viewModel.setDeadlineRecurrenceOverride(it.ifBlank { null })
                        showDeadlineRecurrenceDialog = false
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
    onDeadlineRecurrenceClick: () -> Unit,
    onReminderClick: () -> Unit
) {
    val zone = ZoneId.systemDefault()
    val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            parsed.dueAt?.let {
                val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                val label = if (parsed.allDay) {
                    "Due ${dt.toLocalDate().toString()} · All day"
                } else {
                    "Due ${dt.format(formatter)}"
                }
                AssistChip(onClick = onDueClick, label = { Text(label) })
            } ?: AssistChip(onClick = onDueClick, label = { Text("Set due") })
            parsed.deadlineAt?.let {
                val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                val label = if (parsed.deadlineAllDay) {
                    "Deadline ${dt.toLocalDate().toString()} · All day"
                } else {
                    "Deadline ${dt.format(formatter)}"
                }
                AssistChip(onClick = onDeadlineClick, label = { Text(label) })
            } ?: AssistChip(onClick = onDeadlineClick, label = { Text("Set deadline") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            AssistChip(onClick = onPriorityClick, label = { Text(parsed.priority.name) })
            AssistChip(onClick = onProjectClick, label = { Text(parsed.projectName?.let { "#${it}" } ?: "Inbox") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            parsed.recurrenceRule?.let {
                AssistChip(onClick = onRecurrenceClick, label = { Text("Repeat") })
            } ?: AssistChip(onClick = onRecurrenceClick, label = { Text("Add repeat") })
            parsed.deadlineRecurringRule?.let {
                AssistChip(onClick = onDeadlineRecurrenceClick, label = { Text("Deadline repeat") })
            } ?: AssistChip(onClick = onDeadlineRecurrenceClick, label = { Text("Add deadline repeat") })
        }
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
