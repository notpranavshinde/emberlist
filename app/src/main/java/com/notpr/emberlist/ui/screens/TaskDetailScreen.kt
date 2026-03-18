package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.QuickAddResult
import com.notpr.emberlist.parsing.ReminderSpec
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

@Composable
fun TaskDetailScreen(padding: PaddingValues, taskId: String, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TaskDetailViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val task by remember(taskId) { viewModel.observeTask(taskId) }.collectAsState()
    val subtasks by remember(taskId) { viewModel.observeSubtasks(taskId) }.collectAsState()
    val reminders by remember(taskId) { viewModel.observeReminders(taskId) }.collectAsState()
    val projects by remember { viewModel.observeProjects() }.collectAsState()
    val allSections by remember { viewModel.observeAllSections() }.collectAsState()
    val activity by remember(taskId) { viewModel.observeActivity(taskId) }.collectAsState()

    val backDispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val context = LocalContext.current
    val zone = ZoneId.systemDefault()
    val parser = remember { QuickAddParser(zone) }
    val json = remember { Json { ignoreUnknownKeys = true } }
    val projectById = remember(projects) { projects.associateBy { it.id } }
    val sectionById = remember(allSections) { allSections.associateBy { it.id } }

    var description by remember(taskId) { mutableStateOf("") }
    var inputState by remember(taskId) { mutableStateOf(TextFieldValue("")) }
    var seededTaskId by remember(taskId) { mutableStateOf<String?>(null) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showPriorityDialog by remember { mutableStateOf(false) }
    var showProjectDialog by remember { mutableStateOf(false) }
    var showRecurrenceDialog by remember { mutableStateOf(false) }
    var showDeadlineRecurrenceDialog by remember { mutableStateOf(false) }
    var showReminderDialog by remember { mutableStateOf(false) }
    var moreMenuOpen by remember { mutableStateOf(false) }
    var projectMenuOpen by remember { mutableStateOf(false) }
    var sectionMenuOpen by remember { mutableStateOf(false) }
    var activityExpanded by remember(taskId) { mutableStateOf(false) }
    val parserFocusRequester = remember { FocusRequester() }

    var dueOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var dueOverride by remember(taskId) { mutableStateOf<Long?>(null) }
    var dueAllDayOverride by remember(taskId) { mutableStateOf<Boolean?>(null) }
    var deadlineOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var deadlineOverride by remember(taskId) { mutableStateOf<Long?>(null) }
    var deadlineAllDayOverride by remember(taskId) { mutableStateOf<Boolean?>(null) }
    var priorityOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var priorityOverride by remember(taskId) { mutableStateOf<Priority?>(null) }
    var projectOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var projectOverride by remember(taskId) { mutableStateOf<String?>(null) }
    var sectionOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var sectionOverride by remember(taskId) { mutableStateOf<String?>(null) }
    var recurrenceOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var recurrenceOverride by remember(taskId) { mutableStateOf<String?>(null) }
    var deadlineRecurrenceOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var deadlineRecurrenceOverride by remember(taskId) { mutableStateOf<String?>(null) }
    var remindersOverrideEnabled by remember(taskId) { mutableStateOf(false) }
    var remindersOverride by remember(taskId) { mutableStateOf<List<ReminderSpec>>(emptyList()) }

    val hashToken = remember(inputState.text) {
        val hashIndex = inputState.text.lastIndexOf('#')
        if (hashIndex == -1) {
            null
        } else {
            inputState.text.substring(hashIndex + 1).takeWhile { !it.isWhitespace() }
        }
    }
    val hasSlash = hashToken?.contains("/") == true
    val projectQuery = remember(hashToken) {
        hashToken?.substringBefore("/")?.trim()?.ifBlank { null }
    }
    val sectionQuery = remember(hashToken) {
        if (!hasSlash) null else hashToken?.substringAfter("/")?.trim()?.ifBlank { "" }
    }
    val projectNames = remember(projects) { projects.map { it.name } }
    val projectMatches = remember(projectQuery, projectNames) {
        val query = projectQuery?.trim().orEmpty()
        when {
            projectQuery == null -> emptyList<String>()
            query.isBlank() -> projectNames
            else -> projectNames.filter { it.contains(query, ignoreCase = true) }
        }
    }
    val selectedProjectId = remember(projectQuery, projects) {
        val name = projectQuery ?: return@remember null
        projects.firstOrNull { it.name.equals(name, ignoreCase = true) }?.id
    }
    val sectionMatches = remember(sectionQuery, allSections, selectedProjectId) {
        if (sectionQuery == null || selectedProjectId == null) {
            emptyList<String>()
        } else {
            val names = allSections.filter { it.projectId == selectedProjectId }.map { it.name }
            val query = sectionQuery.trim()
            if (query.isBlank()) names else names.filter { it.contains(query, ignoreCase = true) }
        }
    }

    LaunchedEffect(task?.id, projects, allSections, reminders) {
        val current = task ?: return@LaunchedEffect
        if (seededTaskId == current.id && projects.isNotEmpty()) return@LaunchedEffect
        val projectName = current.projectId?.let { id -> projectById[id]?.name }
        val sectionName = current.sectionId?.let { id -> sectionById[id]?.name }
        description = current.description
        inputState = TextFieldValue(
            serializeTaskToParserInput(
                task = current,
                projectName = projectName,
                sectionName = sectionName,
                reminders = reminders,
                zone = zone
            ),
            selection = TextRange(
                serializeTaskToParserInput(
                    task = current,
                    projectName = projectName,
                    sectionName = sectionName,
                    reminders = reminders,
                    zone = zone
                ).length
            )
        )
        dueOverrideEnabled = false
        dueOverride = null
        dueAllDayOverride = null
        deadlineOverrideEnabled = false
        deadlineOverride = null
        deadlineAllDayOverride = null
        priorityOverrideEnabled = false
        priorityOverride = null
        projectOverrideEnabled = false
        projectOverride = null
        sectionOverrideEnabled = false
        sectionOverride = null
        recurrenceOverrideEnabled = false
        recurrenceOverride = null
        deadlineRecurrenceOverrideEnabled = false
        deadlineRecurrenceOverride = null
        remindersOverrideEnabled = reminders.size > 1
        remindersOverride = reminders.mapNotNull { it.toReminderSpec() }
        seededTaskId = current.id
    }

    val parsed by remember(
        inputState.text,
        dueOverrideEnabled,
        dueOverride,
        dueAllDayOverride,
        deadlineOverrideEnabled,
        deadlineOverride,
        deadlineAllDayOverride,
        priorityOverrideEnabled,
        priorityOverride,
        projectOverrideEnabled,
        projectOverride,
        sectionOverrideEnabled,
        sectionOverride,
        recurrenceOverrideEnabled,
        recurrenceOverride,
        deadlineRecurrenceOverrideEnabled,
        deadlineRecurrenceOverride,
        remindersOverrideEnabled,
        remindersOverride
    ) {
        derivedStateOf {
            mergeParsedTaskDetailResult(
                base = parser.parse(inputState.text),
                dueOverrideEnabled = dueOverrideEnabled,
                dueOverride = dueOverride,
                dueAllDayOverride = dueAllDayOverride,
                deadlineOverrideEnabled = deadlineOverrideEnabled,
                deadlineOverride = deadlineOverride,
                deadlineAllDayOverride = deadlineAllDayOverride,
                priorityOverrideEnabled = priorityOverrideEnabled,
                priorityOverride = priorityOverride,
                projectOverrideEnabled = projectOverrideEnabled,
                projectOverride = projectOverride,
                sectionOverrideEnabled = sectionOverrideEnabled,
                sectionOverride = sectionOverride,
                recurrenceOverrideEnabled = recurrenceOverrideEnabled,
                recurrenceOverride = recurrenceOverride,
                deadlineRecurrenceOverrideEnabled = deadlineRecurrenceOverrideEnabled,
                deadlineRecurrenceOverride = deadlineRecurrenceOverride,
                remindersOverrideEnabled = remindersOverrideEnabled,
                remindersOverride = remindersOverride
            )
        }
    }

    LaunchedEffect(task?.id, inputState.text, description, parsed, reminders) {
        val current = task ?: return@LaunchedEffect
        if (seededTaskId != current.id) return@LaunchedEffect
        if (inputState.text.trim().isBlank()) return@LaunchedEffect
        viewModel.applyParsedTaskChanges(
            current = current,
            description = description,
            parsed = parsed,
            existingReminders = reminders
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth()
        ) {
            DropdownMenu(
                expanded = projectMenuOpen && projectQuery != null && !hasSlash,
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
                                val cursor = before.length + name.length + spacer.length
                                inputState = TextFieldValue(newText, selection = TextRange(cursor))
                                projectMenuOpen = false
                            }
                        }
                    )
                }
            }
            DropdownMenu(
                expanded = sectionMenuOpen && sectionQuery != null,
                onDismissRequest = { sectionMenuOpen = false },
                properties = PopupProperties(focusable = false),
                modifier = Modifier.fillMaxWidth()
            ) {
                sectionMatches.forEach { name ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = {
                            val currentText = inputState.text
                            val hashIndex = currentText.lastIndexOf('#')
                            if (hashIndex != -1) {
                                val afterHash = currentText.substring(hashIndex + 1)
                                val token = afterHash.takeWhile { !it.isWhitespace() }
                                val slashIndex = token.indexOf('/')
                                if (slashIndex != -1) {
                                    val tokenStart = hashIndex + 1
                                    val before = currentText.substring(0, tokenStart + slashIndex + 1)
                                    val after = currentText.substring(tokenStart + slashIndex + 1)
                                    val remainder = after.dropWhile { !it.isWhitespace() }
                                    val spacer = if (remainder.isEmpty()) " " else ""
                                    val newText = "$before$name$spacer$remainder"
                                    val cursor = before.length + name.length + spacer.length
                                    inputState = TextFieldValue(newText, selection = TextRange(cursor))
                                    sectionMenuOpen = false
                                }
                            }
                        }
                    )
                }
            }
            TextField(
                value = inputState,
                onValueChange = { value ->
                    inputState = value
                    val hashIndex = value.text.lastIndexOf('#')
                    val token = if (hashIndex == -1) "" else value.text.substring(hashIndex + 1).takeWhile { !it.isWhitespace() }
                    val tokenHasSlash = token.contains("/")
                    projectMenuOpen = hashIndex != -1 && !tokenHasSlash
                    sectionMenuOpen = hashIndex != -1 && tokenHasSlash
                },
                placeholder = { Text("Task name") },
                singleLine = true,
                visualTransformation = rememberTaskDetailTokenHighlighter(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    disabledContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(parserFocusRequester)
                    .onFocusChanged { focusState ->
                        projectMenuOpen = focusState.isFocused && projectQuery != null && !hasSlash
                        sectionMenuOpen = focusState.isFocused && sectionQuery != null
                    }
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
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
            )
            TaskDetailParsedChips(
                parsed = parsed,
                onDueClick = {
                    pickTaskDetailDateTime(context, zone) { epoch ->
                        dueOverrideEnabled = true
                        dueOverride = epoch
                        dueAllDayOverride = false
                    }
                },
                onPriorityClick = { showPriorityDialog = true },
                onProjectClick = { showProjectDialog = true },
                onReminderClick = { showReminderDialog = true },
                onMoreClick = { moreMenuOpen = true }
            )
        }

        DropdownMenu(
            expanded = moreMenuOpen,
            onDismissRequest = { moreMenuOpen = false },
            properties = PopupProperties(focusable = false),
            modifier = Modifier.fillMaxWidth()
        ) {
            DropdownMenuItem(
                text = { Text("Set deadline") },
                onClick = {
                    moreMenuOpen = false
                    pickTaskDetailDateTime(context, zone) { epoch ->
                        deadlineOverrideEnabled = true
                        deadlineOverride = epoch
                        deadlineAllDayOverride = false
                    }
                }
            )
            DropdownMenuItem(
                text = { Text("Clear deadline") },
                onClick = {
                    moreMenuOpen = false
                    deadlineOverrideEnabled = true
                    deadlineOverride = null
                    deadlineAllDayOverride = false
                }
            )
            DropdownMenuItem(
                text = { Text("Add repeat") },
                onClick = {
                    moreMenuOpen = false
                    showRecurrenceDialog = true
                }
            )
            DropdownMenuItem(
                text = { Text("Add deadline repeat") },
                onClick = {
                    moreMenuOpen = false
                    showDeadlineRecurrenceDialog = true
                }
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                modifier = Modifier.weight(1f),
                onClick = { task?.let { viewModel.toggleComplete(it) } }
            ) {
                Text(if (task?.status == TaskStatus.COMPLETED) "Uncomplete" else "Complete")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = { task?.let { viewModel.toggleArchive(it) } }
            ) {
                Text(if (task?.status == TaskStatus.ARCHIVED) "Unarchive" else "Archive")
            }
        }

        TextButton(
            onClick = { showDeleteDialog = true },
            modifier = Modifier.padding(top = 4.dp)
        ) {
            Text("Delete", color = MaterialTheme.colorScheme.error)
        }

        Text(
            text = "Subtasks",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 16.dp)
        )
        val currentTask = task
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
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
                    if (titleText.isNotEmpty() && currentTask != null) {
                        viewModel.addSubtask(currentTask, titleText)
                        newSubtask = ""
                    }
                },
                modifier = Modifier.padding(start = 8.dp)
            ) {
                Text("Add")
            }
        }

        if (activity.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Activity", style = MaterialTheme.typography.titleSmall)
                    Text(
                        text = "${activity.size} events",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
                TextButton(onClick = { activityExpanded = !activityExpanded }) {
                    Icon(
                        imageVector = if (activityExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (activityExpanded) "Collapse activity" else "Expand activity"
                    )
                }
            }
            if (activityExpanded) {
                val activityFormatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
                activity.forEach { event ->
                    val timestamp = Instant.ofEpochMilli(event.createdAt).atZone(zone).format(activityFormatter)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp)
                    ) {
                        Text(
                            text = taskActivityLabel(event, json),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = timestamp,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        }
    }

    if (showPriorityDialog) {
        TaskDetailPriorityDialog(
            current = parsed.priority,
            onDismiss = { showPriorityDialog = false },
            onSelect = {
                priorityOverrideEnabled = true
                priorityOverride = it
                showPriorityDialog = false
            }
        )
    }

    if (showProjectDialog) {
        TaskDetailProjectDialog(
            current = parsed.projectName,
            projects = projects,
            onDismiss = { showProjectDialog = false },
            onSelect = { name ->
                projectOverrideEnabled = true
                projectOverride = name
                sectionOverrideEnabled = true
                sectionOverride = null
                showProjectDialog = false
            }
        )
    }

    if (showRecurrenceDialog) {
        TaskDetailRecurrenceDialog(
            current = parsed.recurrenceRule.orEmpty(),
            onDismiss = { showRecurrenceDialog = false },
            onSave = { value ->
                recurrenceOverrideEnabled = true
                recurrenceOverride = value.ifBlank { null }
                showRecurrenceDialog = false
            }
        )
    }

    if (showDeadlineRecurrenceDialog) {
        TaskDetailRecurrenceDialog(
            current = parsed.deadlineRecurringRule.orEmpty(),
            onDismiss = { showDeadlineRecurrenceDialog = false },
            onSave = { value ->
                deadlineRecurrenceOverrideEnabled = true
                deadlineRecurrenceOverride = value.ifBlank { null }
                showDeadlineRecurrenceDialog = false
            }
        )
    }

    if (showReminderDialog) {
        TaskDetailReminderDialog(
            onDismiss = { showReminderDialog = false },
            onSetAbsolute = {
                remindersOverrideEnabled = true
                remindersOverride = listOf(ReminderSpec.Absolute(it))
                showReminderDialog = false
            },
            onSetOffset = {
                remindersOverrideEnabled = true
                remindersOverride = listOf(ReminderSpec.Offset(it))
                showReminderDialog = false
            },
            onClear = {
                remindersOverrideEnabled = true
                remindersOverride = emptyList()
                showReminderDialog = false
            }
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete task") },
            text = { Text("Delete \"${task?.title ?: "this task"}\"?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        task?.let { viewModel.deleteTask(it.id) }
                        showDeleteDialog = false
                        backDispatcher?.onBackPressed()
                    }
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun TaskDetailParsedChips(
    parsed: QuickAddResult,
    onDueClick: () -> Unit,
    onPriorityClick: () -> Unit,
    onProjectClick: () -> Unit,
    onReminderClick: () -> Unit,
    onMoreClick: () -> Unit
) {
    val zone = ZoneId.systemDefault()
    val dueLabel = parsed.dueAt?.let {
        val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
        if (parsed.allDay) {
            dt.toLocalDate().format(DateTimeFormatter.ofPattern("MMM d"))
        } else {
            dt.format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
        }
    } ?: "Date"
    val reminderLabel = when {
        parsed.reminders.isNotEmpty() -> {
            if (parsed.reminders.size > 1) {
                "${parsed.reminders.size} reminders"
            } else {
                when (val spec = parsed.reminders.first()) {
                    is ReminderSpec.Absolute -> {
                        val dt = Instant.ofEpochMilli(spec.timeAtMillis).atZone(zone).toLocalDateTime()
                        "At ${dt.format(DateTimeFormatter.ofPattern("h:mm a"))}"
                    }
                    is ReminderSpec.Offset -> "${spec.minutes}m before"
                }
            }
        }
        parsed.dueAt != null && !parsed.allDay -> {
            val dt = Instant.ofEpochMilli(parsed.dueAt).atZone(zone).toLocalDateTime()
            "At ${dt.format(DateTimeFormatter.ofPattern("h:mm a"))}"
        }
        else -> "Reminders"
    }

    Column(modifier = Modifier.padding(top = 8.dp)) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(
                listOf(
                    Triple(Icons.Default.CalendarMonth, dueLabel, onDueClick),
                    Triple(Icons.Default.Flag, parsed.priority.name, onPriorityClick),
                    Triple(Icons.Default.Notifications, reminderLabel, onReminderClick)
                )
            ) { chip ->
                AssistChip(
                    onClick = chip.third,
                    label = { Text(chip.second) },
                    leadingIcon = { Icon(chip.first, contentDescription = null) }
                )
            }
            item {
                AssistChip(
                    onClick = onMoreClick,
                    label = { Icon(Icons.Default.MoreHoriz, contentDescription = "More") }
                )
            }
        }
        Row(
            modifier = Modifier.padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AssistChip(
                onClick = onProjectClick,
                label = { Text(parsed.projectName?.let { "#$it" } ?: "#Inbox") },
                leadingIcon = { Icon(Icons.Default.Folder, contentDescription = null) },
                trailingIcon = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) }
            )
        }
    }
}

@Composable
private fun TaskDetailPriorityDialog(
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
                        Text(if (item == current) "${item.name} ✓" else item.name)
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
private fun TaskDetailProjectDialog(
    current: String?,
    projects: List<ProjectEntity>,
    onDismiss: () -> Unit,
    onSelect: (String?) -> Unit
) {
    var newProject by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Project") },
        text = {
            Column {
                TextButton(onClick = { onSelect(null) }) {
                    Text(if (current == null) "Inbox ✓" else "Inbox")
                }
                projects.forEach { project ->
                    TextButton(onClick = { onSelect(project.name) }) {
                        Text(if (project.name == current) "${project.name} ✓" else project.name)
                    }
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
private fun TaskDetailRecurrenceDialog(
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
private fun TaskDetailReminderDialog(
    onDismiss: () -> Unit,
    onSetAbsolute: (Long) -> Unit,
    onSetOffset: (Int) -> Unit,
    onClear: () -> Unit
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
                    pickTaskDetailDateTime(context, zone) { onSetAbsolute(it) }
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
                TextButton(onClick = onClear) { Text("Clear reminders") }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

private fun serializeTaskToParserInput(
    task: TaskEntity,
    projectName: String?,
    sectionName: String?,
    reminders: List<ReminderEntity>,
    zone: ZoneId
): String {
    val parts = mutableListOf<String>()
    parts += task.title
    if (task.priority != Priority.P4) {
        parts += task.priority.name.lowercase()
    }
    task.dueAt?.let { dueAt ->
        parts += formatTaskDetailDateToken(dueAt, task.allDay, zone)
    }
    recurrenceRuleToPhrase(task.recurringRule)?.let { parts += it }
    task.deadlineAt?.let { deadlineAt ->
        parts += "by ${formatTaskDetailDateToken(deadlineAt, task.deadlineAllDay, zone)}"
    }
    recurrenceRuleToPhrase(task.deadlineRecurringRule)?.let { parts += "deadline $it" }
    val reminderPhrase = reminderPhrase(reminders.firstOrNull(), zone)
    if (reminders.size <= 1 && reminderPhrase != null) {
        parts += reminderPhrase
    }
    if (projectName != null) {
        parts += buildString {
            append("#")
            append(projectName)
            if (!sectionName.isNullOrBlank()) {
                append("/")
                append(sectionName)
            }
        }
    }
    return parts.joinToString(" ").replace(Regex("\\s+"), " ").trim()
}

private fun formatTaskDetailDateToken(epochMillis: Long, allDay: Boolean, zone: ZoneId): String {
    val dateTime = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDateTime()
    val datePart = dateTime.toLocalDate().format(DateTimeFormatter.ofPattern("MMM d"))
    return if (allDay) {
        datePart
    } else {
        "$datePart ${dateTime.toLocalTime().format(DateTimeFormatter.ofPattern("h:mm a"))}"
    }
}

private fun reminderPhrase(reminder: ReminderEntity?, zone: ZoneId): String? {
    reminder ?: return null
    return when {
        reminder.timeAt != null -> {
            val dateTime = Instant.ofEpochMilli(reminder.timeAt).atZone(zone).toLocalDateTime()
            "remind me at ${dateTime.toLocalDate().format(DateTimeFormatter.ofPattern("M/d"))} ${dateTime.toLocalTime().format(DateTimeFormatter.ofPattern("h:mm a"))}"
        }
        reminder.offsetMinutes != null -> "remind me ${reminder.offsetMinutes}m before"
        else -> null
    }
}

private fun recurrenceRuleToPhrase(rule: String?): String? {
    if (rule.isNullOrBlank()) return null
    val freq = Regex("FREQ=([A-Z]+)").find(rule)?.groupValues?.get(1) ?: return null
    val interval = Regex("INTERVAL=(\\d+)").find(rule)?.groupValues?.get(1)?.toIntOrNull() ?: 1
    val byDay = Regex("BYDAY=([A-Z,]+)").find(rule)?.groupValues?.get(1)
    val byMonthDay = Regex("BYMONTHDAY=(\\d+)").find(rule)?.groupValues?.get(1)?.toIntOrNull()
    return when {
        rule == "FREQ=DAILY" -> "every day"
        rule == "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" -> "every weekday"
        freq == "WEEKLY" && byDay != null && interval == 2 -> "every other ${dayTokenToWord(byDay)}"
        freq == "WEEKLY" && byDay != null -> "every ${dayTokenToWord(byDay)}"
        freq == "DAILY" && interval == 2 -> "every other day"
        freq == "WEEKLY" && interval == 2 && byDay == null -> "every other week"
        freq == "MONTHLY" && interval == 2 && byDay == null && byMonthDay == null -> "every other month"
        freq == "YEARLY" && interval == 2 -> "every other year"
        freq == "DAILY" && interval > 1 -> "every $interval days"
        freq == "WEEKLY" && interval > 1 && byDay == null -> "every $interval weeks"
        freq == "MONTHLY" && byMonthDay != null -> "every ${ordinal(byMonthDay)}"
        freq == "MONTHLY" && interval > 1 -> "every $interval months"
        freq == "YEARLY" && interval > 1 -> "every $interval years"
        freq == "WEEKLY" -> "every week"
        freq == "MONTHLY" -> "every month"
        freq == "YEARLY" -> "every year"
        else -> null
    }
}

private fun dayTokenToWord(token: String): String {
    return when (token.uppercase()) {
        "MO" -> "monday"
        "TU" -> "tuesday"
        "WE" -> "wednesday"
        "TH" -> "thursday"
        "FR" -> "friday"
        "SA" -> "saturday"
        "SU" -> "sunday"
        else -> "day"
    }
}

private fun ordinal(value: Int): String {
    val suffix = when {
        value % 100 in 11..13 -> "th"
        value % 10 == 1 -> "st"
        value % 10 == 2 -> "nd"
        value % 10 == 3 -> "rd"
        else -> "th"
    }
    return "$value$suffix"
}

private fun ReminderEntity.toReminderSpec(): ReminderSpec? {
    return when {
        timeAt != null -> ReminderSpec.Absolute(timeAt)
        offsetMinutes != null -> ReminderSpec.Offset(offsetMinutes)
        else -> null
    }
}

private fun mergeParsedTaskDetailResult(
    base: QuickAddResult,
    dueOverrideEnabled: Boolean,
    dueOverride: Long?,
    dueAllDayOverride: Boolean?,
    deadlineOverrideEnabled: Boolean,
    deadlineOverride: Long?,
    deadlineAllDayOverride: Boolean?,
    priorityOverrideEnabled: Boolean,
    priorityOverride: Priority?,
    projectOverrideEnabled: Boolean,
    projectOverride: String?,
    sectionOverrideEnabled: Boolean,
    sectionOverride: String?,
    recurrenceOverrideEnabled: Boolean,
    recurrenceOverride: String?,
    deadlineRecurrenceOverrideEnabled: Boolean,
    deadlineRecurrenceOverride: String?,
    remindersOverrideEnabled: Boolean,
    remindersOverride: List<ReminderSpec>?
): QuickAddResult {
    return base.copy(
        dueAt = if (dueOverrideEnabled) dueOverride else base.dueAt,
        deadlineAt = if (deadlineOverrideEnabled) deadlineOverride else base.deadlineAt,
        allDay = if (dueOverrideEnabled) dueAllDayOverride ?: base.allDay else base.allDay,
        deadlineAllDay = if (deadlineOverrideEnabled) deadlineAllDayOverride ?: base.deadlineAllDay else base.deadlineAllDay,
        priority = if (priorityOverrideEnabled) priorityOverride ?: base.priority else base.priority,
        projectName = if (projectOverrideEnabled) projectOverride else base.projectName,
        sectionName = if (sectionOverrideEnabled) sectionOverride else base.sectionName,
        recurrenceRule = if (recurrenceOverrideEnabled) recurrenceOverride else base.recurrenceRule,
        deadlineRecurringRule = if (deadlineRecurrenceOverrideEnabled) deadlineRecurrenceOverride else base.deadlineRecurringRule,
        reminders = if (remindersOverrideEnabled) remindersOverride ?: emptyList() else base.reminders
    )
}

@Composable
private fun rememberTaskDetailTokenHighlighter(): VisualTransformation {
    val highlight = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
    return remember(highlight) {
        VisualTransformation { text ->
            TransformedText(
                highlightTaskDetailTokens(text.text, highlight),
                OffsetMapping.Identity
            )
        }
    }
}

private fun highlightTaskDetailTokens(text: String, color: Color): AnnotatedString {
    if (text.isBlank()) return AnnotatedString(text)
    val patterns = listOf(
        Regex("#\\S+"),
        Regex("\\bp[1-4]\\b", RegexOption.IGNORE_CASE),
        Regex("\\b(today|tomorrow|next week|this weekend|next weekend)\\b", RegexOption.IGNORE_CASE),
        Regex("\\b(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\\b", RegexOption.IGNORE_CASE),
        Regex("\\bin\\s+\\d+\\s+days\\b", RegexOption.IGNORE_CASE),
        Regex("\\d{4}-\\d{1,2}-\\d{1,2}"),
        Regex("\\d{1,2}/\\d{1,2}(/\\d{2,4})?"),
        Regex("\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+\\d{1,2}(st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b", RegexOption.IGNORE_CASE),
        Regex("\\b\\d{1,2}(st|nd|rd|th)?\\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\\s+\\d{4})?\\b", RegexOption.IGNORE_CASE),
        Regex("\\d{1,2}(:\\d{2})?\\s?(am|pm)", RegexOption.IGNORE_CASE),
        Regex("\\bevery\\s+[^#]+", RegexOption.IGNORE_CASE),
        Regex("\\beveryday\\b", RegexOption.IGNORE_CASE),
        Regex("\\bevery\\s+day\\b", RegexOption.IGNORE_CASE),
        Regex("\\b(deadline|by)\\s+[^#]+", RegexOption.IGNORE_CASE),
        Regex("\\{deadline:[^}]+\\}", RegexOption.IGNORE_CASE),
        Regex("\\bremind me\\b[^#]+", RegexOption.IGNORE_CASE)
    )
    val ranges = patterns.flatMap { regex ->
        regex.findAll(text).map { it.range }
    }
        .map { it.first to (it.last + 1) }
        .sortedBy { it.first }
        .fold(mutableListOf<Pair<Int, Int>>()) { acc, range ->
            if (acc.isEmpty()) {
                acc.add(range)
            } else {
                val last = acc.last()
                if (range.first <= last.second) {
                    acc[acc.lastIndex] = last.first to maxOf(last.second, range.second)
                } else {
                    acc.add(range)
                }
            }
            acc
        }
    val builder = AnnotatedString.Builder(text)
    val style = SpanStyle(background = color)
    ranges.forEach { (start, end) ->
        if (start in 0 until end && end <= text.length) {
            builder.addStyle(style, start, end)
        }
    }
    return builder.toAnnotatedString()
}

private fun pickTaskDetailDateTime(
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
