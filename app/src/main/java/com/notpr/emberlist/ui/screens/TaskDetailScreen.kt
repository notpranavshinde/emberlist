package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TaskDetailScreen(padding: PaddingValues, taskId: String) {
    val container = LocalAppContainer.current
    val viewModel: TaskDetailViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val taskFlow = remember(taskId) { viewModel.observeTask(taskId) }
    val activityFlow = remember(taskId) { viewModel.observeActivity(taskId) }
    val subtasksFlow = remember(taskId) { viewModel.observeSubtasks(taskId) }
    val remindersFlow = remember(taskId) { viewModel.observeReminders(taskId) }
    val projectsFlow = remember { viewModel.observeProjects() }

    val task by taskFlow.collectAsState()
    val activity by activityFlow.collectAsState()
    val subtasks by subtasksFlow.collectAsState()
    val reminders by remindersFlow.collectAsState()
    val projects by projectsFlow.collectAsState()

    var title by remember(task?.title) { mutableStateOf(task?.title ?: "") }
    var description by remember(task?.description) { mutableStateOf(task?.description ?: "") }
    var priority by remember(task?.priority) { mutableStateOf(task?.priority ?: Priority.P4) }
    var dueAt by remember(task?.dueAt) { mutableStateOf(task?.dueAt) }
    var deadlineAt by remember(task?.deadlineAt) { mutableStateOf(task?.deadlineAt) }
    var allDay by remember(task?.allDay) { mutableStateOf(task?.allDay ?: false) }
    var deadlineAllDay by remember(task?.deadlineAllDay) { mutableStateOf(task?.deadlineAllDay ?: false) }
    var recurrenceRule by remember(task?.recurringRule) { mutableStateOf(task?.recurringRule ?: "") }
    var deadlineRecurrenceRule by remember(task?.deadlineRecurringRule) { mutableStateOf(task?.deadlineRecurringRule ?: "") }
    var projectId by remember(task?.projectId) { mutableStateOf(task?.projectId) }
    var sectionId by remember(task?.sectionId) { mutableStateOf(task?.sectionId) }
    var reminderOffsetText by remember { mutableStateOf("30") }
    val sectionsFlow = remember(projectId) { viewModel.observeSections(projectId ?: "") }
    val sections by sectionsFlow.collectAsState()
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    val dateFormatter = DateTimeFormatter.ofPattern("EEE, MMM d")
    val timeFormatter = DateTimeFormatter.ofPattern("h:mm a")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(text = "Task Detail")
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("Title") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth()
        )

        SpacerLine()
        PriorityPicker(priority = priority, onSelect = { priority = it })

        ProjectPicker(
            projectId = projectId,
            projects = projects,
            onSelect = {
                projectId = it
                sectionId = null
            }
        )
        if (projectId != null) {
            SectionPicker(
                sectionId = sectionId,
                sections = sections,
                onSelect = { sectionId = it }
            )
        }

        DuePicker(
            label = "Due",
            epochMillis = dueAt,
            allDay = allDay,
            onAllDayChange = { allDay = it },
            onChange = { dueAt = it },
            context = context,
            zone = zone,
            dateFormatter = dateFormatter,
            timeFormatter = timeFormatter
        )
        DuePicker(
            label = "Deadline",
            epochMillis = deadlineAt,
            allDay = deadlineAllDay,
            onAllDayChange = { deadlineAllDay = it },
            onChange = { deadlineAt = it },
            context = context,
            zone = zone,
            dateFormatter = dateFormatter,
            timeFormatter = timeFormatter
        )

        OutlinedTextField(
            value = recurrenceRule,
            onValueChange = { recurrenceRule = it },
            label = { Text("Recurrence (RRULE)") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = deadlineRecurrenceRule,
            onValueChange = { deadlineRecurrenceRule = it },
            label = { Text("Deadline recurrence (RRULE)") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(onClick = {
            task?.let {
                viewModel.updateTask(
                    it.copy(
                        title = title,
                        description = description,
                        priority = priority,
                        dueAt = dueAt,
                        deadlineAt = deadlineAt,
                        allDay = allDay,
                        deadlineAllDay = deadlineAllDay,
                        recurringRule = recurrenceRule.ifBlank { null },
                        deadlineRecurringRule = deadlineRecurrenceRule.ifBlank { null },
                        projectId = projectId,
                        sectionId = sectionId
                    )
                )
            }
        }) {
            Text(text = "Save")
        }

        Text(text = "Reminders")
        reminders.forEach { reminder ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                val label = reminder.timeAt?.let {
                    val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                    "At ${dt.format(dateFormatter)} ${dt.format(timeFormatter)}"
                } ?: "Offset ${reminder.offsetMinutes}m"
                Text(text = label)
                Switch(
                    checked = reminder.enabled,
                    onCheckedChange = { task?.let { t -> viewModel.toggleReminder(t, reminder) } }
                )
            }
            Button(onClick = { viewModel.deleteReminder(reminder) }) {
                Text("Delete")
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Button(onClick = {
                task?.let { t ->
                    val now = LocalDateTime.now(zone)
                    val timePicker = TimePickerDialog(
                        context,
                        { _, hour, minute ->
                            val date = now.toLocalDate()
                            val instant = LocalDateTime.of(date, LocalTime.of(hour, minute))
                                .atZone(zone).toInstant().toEpochMilli()
                            viewModel.addReminderAt(t, instant)
                        },
                        now.hour,
                        now.minute,
                        false
                    )
                    timePicker.show()
                }
            }) {
                Text("Add Reminder At")
            }
            Button(onClick = {
                task?.let { t ->
                    val minutes = reminderOffsetText.toIntOrNull() ?: 30
                    viewModel.addReminderOffset(t, minutes)
                }
            }) {
                Text("Add Offset")
            }
        }
        OutlinedTextField(
            value = reminderOffsetText,
            onValueChange = { reminderOffsetText = it },
            label = { Text("Offset minutes") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(onClick = {
            task?.let { viewModel.toggleComplete(it) }
        }) {
            Text(text = if (task?.status == TaskStatus.COMPLETED) "Uncomplete" else "Complete")
        }
        Button(onClick = {
            task?.let { viewModel.toggleArchive(it) }
        }) {
            Text(text = if (task?.status == TaskStatus.ARCHIVED) "Unarchive" else "Archive")
        }

        Text(text = "Subtasks")
        subtasks.forEach { subtask ->
            Text(text = subtask.title)
        }

        Text(text = "Activity")
        activity.take(5).forEach { event ->
            Text(text = "${event.type} at ${event.createdAt}")
        }
    }
}

@Composable
private fun PriorityPicker(priority: Priority, onSelect: (Priority) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "Priority: ${priority.name}")
        TextButton(onClick = { open = true }) { Text("Change") }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Priority") },
            text = {
                Column {
                    Priority.values().forEach { item ->
                        TextButton(onClick = {
                            onSelect(item)
                            open = false
                        }) { Text(item.name) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { open = false }) { Text("Close") } }
        )
    }
}

@Composable
private fun ProjectPicker(
    projectId: String?,
    projects: List<com.notpr.emberlist.data.model.ProjectEntity>,
    onSelect: (String?) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val current = projects.firstOrNull { it.id == projectId }?.name ?: "Inbox"
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "Project: $current")
        TextButton(onClick = { open = true }) { Text("Change") }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Project") },
            text = {
                Column {
                    TextButton(onClick = { onSelect(null); open = false }) { Text("Inbox") }
                    projects.forEach { project ->
                        TextButton(onClick = { onSelect(project.id); open = false }) {
                            Text(project.name)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { open = false }) { Text("Close") } }
        )
    }
}

@Composable
private fun SectionPicker(
    sectionId: String?,
    sections: List<com.notpr.emberlist.data.model.SectionEntity>,
    onSelect: (String?) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val current = sections.firstOrNull { it.id == sectionId }?.name ?: "No Section"
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "Section: $current")
        TextButton(onClick = { open = true }) { Text("Change") }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Section") },
            text = {
                Column {
                    TextButton(onClick = { onSelect(null); open = false }) { Text("No Section") }
                    sections.forEach { section ->
                        TextButton(onClick = { onSelect(section.id); open = false }) {
                            Text(section.name)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { open = false }) { Text("Close") } }
        )
    }
}

@Composable
private fun DuePicker(
    label: String,
    epochMillis: Long?,
    allDay: Boolean,
    onAllDayChange: (Boolean) -> Unit,
    onChange: (Long?) -> Unit,
    context: android.content.Context,
    zone: ZoneId,
    dateFormatter: DateTimeFormatter,
    timeFormatter: DateTimeFormatter
) {
    val date = epochMillis?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDate() }
    val time = epochMillis?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalTime() }
    val display = if (epochMillis == null) "None" else {
        val dateText = date?.format(dateFormatter)
        val timeText = if (allDay) "All day" else time?.format(timeFormatter)
        "$dateText · $timeText"
    }
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = "$label: $display")
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    val base = date ?: LocalDate.now(zone)
                    DatePickerDialog(
                        context,
                        { _, year, month, day ->
                            val pickedDate = LocalDate.of(year, month + 1, day)
                            val pickedTime = if (allDay) LocalTime.MIDNIGHT else time ?: LocalTime.of(9, 0)
                            val instant = LocalDateTime.of(pickedDate, pickedTime).atZone(zone)
                                .toInstant().toEpochMilli()
                            onChange(instant)
                        },
                        base.year,
                        base.monthValue - 1,
                        base.dayOfMonth
                    ).show()
                }
            ) { Text("Pick Date") }
            if (!allDay) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        val base = time ?: LocalTime.of(9, 0)
                        TimePickerDialog(
                            context,
                            { _, hour, minute ->
                                val pickedDate = date ?: LocalDate.now(zone)
                                val instant = LocalDateTime.of(pickedDate, LocalTime.of(hour, minute))
                                    .atZone(zone).toInstant().toEpochMilli()
                                onChange(instant)
                            },
                            base.hour,
                            base.minute,
                            false
                        ).show()
                    }
                ) { Text("Pick Time") }
            }
        }
    }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text = "All day")
        Switch(checked = allDay, onCheckedChange = onAllDayChange)
    }
}

@Composable
private fun SpacerLine() {
    androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))
}
