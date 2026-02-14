package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.flow.flowOf

@Composable
fun TaskDetailScreen(padding: PaddingValues, taskId: String, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TaskDetailViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val taskFlow = remember(taskId) { viewModel.observeTask(taskId) }
    val subtasksFlow = remember(taskId) { viewModel.observeSubtasks(taskId) }
    val remindersFlow = remember(taskId) { viewModel.observeReminders(taskId) }
    val projectsFlow = remember { viewModel.observeProjects() }
    val activityFlow = remember(taskId) { viewModel.observeActivity(taskId) }

    val task by taskFlow.collectAsState()
    val subtasks by subtasksFlow.collectAsState()
    val reminders by remindersFlow.collectAsState()
    val projects by projectsFlow.collectAsState()
    val activity by activityFlow.collectAsState()

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
    var showDeleteDialog by remember { mutableStateOf(false) }
    val sectionsFlow = remember(projectId) { viewModel.observeSections(projectId ?: "") }
    val sections by sectionsFlow.collectAsState()
    val projectById = projects.associateBy { it.id }
    val sectionById = sections.associateBy { it.id }
    val backDispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    val dateFormatter = DateTimeFormatter.ofPattern("EEE, MMM d")
    val timeFormatter = DateTimeFormatter.ofPattern("h:mm a")
    val activityFormatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
    val json = remember { Json { ignoreUnknownKeys = true } }
    val fineLocationGranted = ContextCompat.checkSelfPermission(
        context,
        android.Manifest.permission.ACCESS_FINE_LOCATION
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    val backgroundLocationGranted = if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
        true
    } else {
        ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }
    val locationEnabled = fineLocationGranted && backgroundLocationGranted
    val canRequestFine = !fineLocationGranted
    var showBackgroundDialog by remember { mutableStateOf(false) }
    val requestFineLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted && !backgroundLocationGranted) {
            showBackgroundDialog = true
        }
    }
    val openAppSettings = {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null)
        )
        context.startActivity(intent)
    }
    val locationFlow = remember(task?.locationId) {
        task?.locationId?.let { viewModel.observeLocation(it) } ?: flowOf(null)
    }
    val location by locationFlow.collectAsState(initial = null)
    var reminderLocations by remember { mutableStateOf<Map<String, LocationEntity>>(emptyMap()) }

    LaunchedEffect(reminders) {
        val ids = reminders.mapNotNull { it.locationId }.distinct()
        reminderLocations = if (ids.isEmpty()) {
            emptyMap()
        } else {
            viewModel.getLocationsByIds(ids).associateBy { it.id }
        }
    }

    LaunchedEffect(
        task?.id,
        title,
        description,
        priority,
        dueAt,
        deadlineAt,
        allDay,
        deadlineAllDay,
        recurrenceRule,
        deadlineRecurrenceRule,
        projectId,
        sectionId
    ) {
        val current = task ?: return@LaunchedEffect
        val updated = current.copy(
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
        if (updated != current) {
            viewModel.updateTask(updated)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        TextField(
            value = title,
            onValueChange = { title = it },
            placeholder = { Text("Task name") },
            singleLine = true,
            textStyle = MaterialTheme.typography.titleLarge,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.fillMaxWidth()
        )
        TextField(
            value = description,
            onValueChange = { description = it },
            placeholder = { Text("Description") },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodySmall.copy(
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            ),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

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

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

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

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

        Text(text = "Recurrence", style = MaterialTheme.typography.titleSmall)
        TextField(
            value = recurrenceRule,
            onValueChange = { recurrenceRule = it },
            placeholder = { Text("Recurrence (RRULE)") },
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.fillMaxWidth()
        )
        TextField(
            value = deadlineRecurrenceRule,
            onValueChange = { deadlineRecurrenceRule = it },
            placeholder = { Text("Deadline recurrence (RRULE)") },
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

        Text(text = "Location", style = MaterialTheme.typography.titleSmall)
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            val label = location?.label ?: "No location"
            val triggerLabel = task?.locationTriggerType?.name?.lowercase()?.replaceFirstChar { it.titlecase() }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = label, style = MaterialTheme.typography.bodyMedium)
                if (triggerLabel != null) {
                    Text(
                        text = triggerLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
            TextButton(
                enabled = locationEnabled || canRequestFine,
                onClick = {
                    if (!fineLocationGranted) {
                        requestFineLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    } else if (!backgroundLocationGranted) {
                        showBackgroundDialog = true
                    } else {
                        navController.navigate("locationPicker/${taskId}/task")
                    }
                }
            ) { Text(if (location == null) "Set" else "Change") }
        }
        if (location != null) {
            TextButton(onClick = { task?.let { viewModel.clearTaskLocation(it) } }) {
                Text("Clear location")
            }
        }
        if (!locationEnabled) {
            Text(
                text = "Enable \"Allow all the time\" location access to use this feature.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

        Text(text = "Reminders", style = MaterialTheme.typography.titleSmall)
        reminders.forEach { reminder ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                val label = if (reminder.type == com.notpr.emberlist.data.model.ReminderType.LOCATION) {
                    val loc = reminder.locationId?.let { reminderLocations[it] }
                    val triggerLabel = reminder.locationTriggerType?.name?.lowercase()?.replaceFirstChar { it.titlecase() } ?: "Arrive"
                    "$triggerLabel ${loc?.label ?: "location"}"
                } else {
                    reminder.timeAt?.let {
                        val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
                        "At ${dt.format(dateFormatter)} ${dt.format(timeFormatter)}"
                    } ?: "Offset ${reminder.offsetMinutes}m"
                }
                Text(text = label, style = MaterialTheme.typography.bodySmall)
                Switch(
                    checked = reminder.enabled,
                    onCheckedChange = { task?.let { t -> viewModel.toggleReminder(t, reminder) } }
                )
            }
            TextButton(onClick = { viewModel.deleteReminder(reminder) }) {
                Text("Delete")
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
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
            }, modifier = Modifier.weight(1f)) {
                Text("Add Reminder At")
            }
            TextButton(onClick = {
                task?.let { t ->
                    val minutes = reminderOffsetText.toIntOrNull() ?: 30
                    viewModel.addReminderOffset(t, minutes)
                }
            }, modifier = Modifier.weight(1f)) {
                Text("Add Offset")
            }
            TextButton(
                enabled = locationEnabled || canRequestFine,
                onClick = {
                    if (!fineLocationGranted) {
                        requestFineLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
                    } else if (!backgroundLocationGranted) {
                        showBackgroundDialog = true
                    } else {
                        navController.navigate("locationPicker/${taskId}/reminder")
                    }
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("Add Location")
            }
        }
        TextField(
            value = reminderOffsetText,
            onValueChange = { reminderOffsetText = it },
            placeholder = { Text("Offset minutes") },
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                modifier = Modifier.weight(1f),
                onClick = { task?.let { viewModel.toggleComplete(it) } }
            ) {
                Text(text = if (task?.status == TaskStatus.COMPLETED) "Uncomplete" else "Complete")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = { task?.let { viewModel.toggleArchive(it) } }
            ) {
                Text(text = if (task?.status == TaskStatus.ARCHIVED) "Unarchive" else "Archive")
            }
        }
        TextButton(onClick = { showDeleteDialog = true }) {
            Text(text = "Delete", color = MaterialTheme.colorScheme.error)
        }

        Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
        Text(text = "Subtasks", style = MaterialTheme.typography.titleSmall)
        val parent = task
        var newSubtask by remember(task?.id) { mutableStateOf("") }
        subtasks.forEach { subtask ->
            val item = buildTaskListItem(
                task = subtask,
                projectById = projectById,
                sectionById = sectionById
            ).copy(isSubtask = true, indentLevel = 1)
            TaskRow(
                item = item,
                onToggle = viewModel::toggleComplete,
                onDelete = { viewModel.deleteTask(it.id) },
                onClick = null
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextField(
                value = newSubtask,
                onValueChange = { newSubtask = it },
                placeholder = { Text("Add subtask") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    disabledContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                )
            )
            Button(
                onClick = {
                    val titleText = newSubtask.trim()
                    if (titleText.isNotEmpty() && parent != null) {
                        viewModel.addSubtask(parent, titleText)
                        newSubtask = ""
                    }
                },
                modifier = Modifier.padding(start = 8.dp)
            ) { Text("Add") }
        }

        if (activity.isNotEmpty()) {
            Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            Text(text = "Activity", style = MaterialTheme.typography.titleSmall)
            activity.forEach { event ->
                val timestamp = Instant.ofEpochMilli(event.createdAt).atZone(zone).format(activityFormatter)
                Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    val detail = taskActivityLabel(event, json)
                    Text(text = detail, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = timestamp,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
        }
    }

    if (showBackgroundDialog) {
        AlertDialog(
            onDismissRequest = { showBackgroundDialog = false },
            title = { Text("Enable background location") },
            text = { Text("To trigger location reminders when the app is closed, enable \"Allow all the time\" in app settings.") },
            confirmButton = {
                TextButton(onClick = {
                    showBackgroundDialog = false
                    openAppSettings()
                }) { Text("Open settings") }
            },
            dismissButton = {
                TextButton(onClick = { showBackgroundDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete task") },
            text = { Text("Delete \"${task?.title ?: "this task"}\"?") },
            confirmButton = {
                TextButton(onClick = {
                    task?.let { viewModel.deleteTask(it.id) }
                    showDeleteDialog = false
                    backDispatcher?.onBackPressed()
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun PriorityPicker(priority: Priority, onSelect: (Priority) -> Unit) {
    var open by remember { mutableStateOf(false) }
    InlinePickerRow(
        label = "Priority",
        value = priority.name,
        onChange = { open = true }
    )
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
    InlinePickerRow(
        label = "Project",
        value = current,
        onChange = { open = true }
    )
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
    InlinePickerRow(
        label = "Section",
        value = current,
        onChange = { open = true }
    )
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
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(text = label, style = MaterialTheme.typography.bodySmall)
                Text(text = display, style = MaterialTheme.typography.bodyMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextButton(
                    onClick = {
                        val base = date ?: LocalDate.now(zone)
                        val dialog = DatePickerDialog(
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
                        )
                        dialog.setButton(
                            android.content.DialogInterface.BUTTON_NEUTRAL,
                            "None"
                        ) { _, _ ->
                            onChange(null)
                            onAllDayChange(false)
                        }
                        dialog.show()
                    }
                ) { Text("Pick date") }
                if (!allDay) {
                    TextButton(
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
                    ) { Text("Pick time") }
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = "All day", style = MaterialTheme.typography.bodySmall)
            Switch(checked = allDay, onCheckedChange = onAllDayChange)
        }
    }
}

@Composable
private fun InlinePickerRow(label: String, value: String, onChange: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(text = label, style = MaterialTheme.typography.bodySmall)
            Text(text = value, style = MaterialTheme.typography.bodyMedium)
        }
        TextButton(onClick = onChange) { Text("Change") }
    }
}

private fun taskActivityLabel(event: ActivityEventEntity, json: Json): String {
    if (event.objectType != ObjectType.TASK) return event.type.name
    return try {
        val payload = json.parseToJsonElement(event.payloadJson).jsonObject
        val title = payload["title"]?.jsonPrimitive?.content
        val action = event.type.name.lowercase().replaceFirstChar { it.uppercase() }
        if (title.isNullOrBlank()) action else "$action: $title"
    } catch (_: Exception) {
        event.type.name
    }
}
