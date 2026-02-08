package com.notpr.emberlist.ui.screens.quickadd

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
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
fun QuickAddSheet(defaultDueToday: Boolean = false, defaultProjectId: String? = null) {
    var open by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val container = LocalAppContainer.current
    val viewModel: QuickAddViewModel = viewModel(factory = EmberlistViewModelFactory(container))

    FloatingActionButton(
        onClick = { open = true },
        containerColor = androidx.compose.ui.graphics.Color(0xFFEE6A3C),
        contentColor = androidx.compose.ui.graphics.Color.White
    ) {
        androidx.compose.material3.Icon(Icons.Default.Add, contentDescription = "Quick Add")
    }

    if (open) {
        ModalBottomSheet(
            onDismissRequest = { open = false },
            sheetState = sheetState
        ) {
            val input by viewModel.input.collectAsState()
            val parsed by viewModel.parsed.collectAsState()
            val description by viewModel.description.collectAsState()
            val projects by viewModel.projects.collectAsState()
            val sections by viewModel.sections.collectAsState()
            val context = LocalContext.current
            val zone = ZoneId.systemDefault()
            val focusManager = LocalFocusManager.current
            val titleFocusRequester = remember { FocusRequester() }
            val projectNames = projects.map { it.name }
            var inputState by remember { mutableStateOf(TextFieldValue(input)) }
            var projectMenuOpen by remember { mutableStateOf(false) }
            var sectionMenuOpen by remember { mutableStateOf(false) }
            val hashToken = remember(inputState.text) {
                val hashIndex = inputState.text.lastIndexOf('#')
                if (hashIndex == -1) return@remember null
                val after = inputState.text.substring(hashIndex + 1)
                after.takeWhile { !it.isWhitespace() }
            }
            val hasSlash = hashToken?.contains("/") == true
            val projectQuery = remember(hashToken) {
                hashToken?.substringBefore("/")?.trim()?.ifBlank { null }
            }
            val sectionQuery = remember(hashToken) {
                if (!hasSlash) return@remember null
                hashToken?.substringAfter("/")?.trim()?.ifBlank { "" }
            }
            val shouldSuggestProject = projectQuery != null && !hasSlash
            val projectMatches = remember(projectQuery, projectNames) {
                val query = projectQuery?.trim().orEmpty()
                if (projectQuery == null) emptyList()
                else if (query.isBlank()) projectNames
                else projectNames.filter { it.contains(query, ignoreCase = true) }
            }
            val selectedProjectId = remember(projectQuery, projects) {
                val name = projectQuery ?: return@remember null
                projects.firstOrNull { it.name.equals(name, ignoreCase = true) }?.id
            }
            val sectionMatches = remember(sectionQuery, sections, selectedProjectId) {
                if (sectionQuery == null || selectedProjectId == null) return@remember emptyList()
                val projectSections = sections.filter { it.projectId == selectedProjectId }.map { it.name }
                val query = sectionQuery.trim()
                if (query.isBlank()) projectSections
                else projectSections.filter { it.contains(query, ignoreCase = true) }
            }

            var showPriorityDialog by remember { mutableStateOf(false) }
            var showProjectDialog by remember { mutableStateOf(false) }
            var showRecurrenceDialog by remember { mutableStateOf(false) }
            var showDeadlineRecurrenceDialog by remember { mutableStateOf(false) }
            var showReminderDialog by remember { mutableStateOf(false) }
            var moreMenuOpen by remember { mutableStateOf(false) }

            LaunchedEffect(input) {
                if (inputState.text != input) {
                    inputState = inputState.copy(text = input, selection = TextRange(input.length))
                }
            }
            LaunchedEffect(open, defaultDueToday) {
                if (!open) return@LaunchedEffect
                if (defaultDueToday) {
                    val todayStart = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
                    viewModel.setDefaultDueToday(todayStart)
                } else {
                    viewModel.setDefaultDueToday(null)
                }
            }
            LaunchedEffect(open, defaultProjectId, projects) {
                if (!open) return@LaunchedEffect
                if (defaultProjectId == null) {
                    viewModel.setDefaultProjectName(null)
                } else {
                    val match = projects.firstOrNull { it.id == defaultProjectId }?.name
                    viewModel.setDefaultProjectName(match)
                }
            }
            LaunchedEffect(Unit) {
                titleFocusRequester.requestFocus()
            }

            Column(modifier = Modifier.padding(16.dp)) {
                Box {
                    Column {
                        TextField(
                            value = inputState,
                            onValueChange = { value ->
                                inputState = value
                                viewModel.updateInput(value.text)
                                val hashIndex = value.text.lastIndexOf('#')
                                val token = if (hashIndex == -1) "" else value.text.substring(hashIndex + 1).takeWhile { !it.isWhitespace() }
                                val hasSlash = token.contains("/")
                                projectMenuOpen = hashIndex != -1 && !hasSlash
                                sectionMenuOpen = hashIndex != -1 && hasSlash
                            },
                            placeholder = { Text("Task name") },
                            singleLine = true,
                            visualTransformation = rememberTokenHighlighter(),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    viewModel.saveTask { /* keep sheet open */ }
                                    titleFocusRequester.requestFocus()
                                }
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
                                .focusRequester(titleFocusRequester)
                                .onFocusChanged { focusState ->
                                    projectMenuOpen = focusState.isFocused && shouldSuggestProject
                                    sectionMenuOpen = focusState.isFocused && sectionQuery != null
                                }
                        )
                        TextField(
                            value = description,
                            onValueChange = { viewModel.updateDescription(it) },
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
                    }
                    DropdownMenu(
                        expanded = projectMenuOpen && shouldSuggestProject,
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
                                        viewModel.setSectionOverride(null)
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
                                            viewModel.updateInput(newText)
                                            viewModel.setSectionOverride(name)
                                            sectionMenuOpen = false
                                        }
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
                    onPriorityClick = { showPriorityDialog = true },
                    onProjectClick = { showProjectDialog = true },
                    onReminderClick = { showReminderDialog = true },
                    onMoreClick = { moreMenuOpen = true }
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    AssistChip(
                        onClick = {
                            viewModel.saveTask { /* keep sheet open */ }
                            titleFocusRequester.requestFocus()
                        },
                        label = { Text("Add") }
                    )
                }
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
                        pickDateTime(context, zone) { viewModel.setDeadlineOverride(it) }
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
    onPriorityClick: () -> Unit,
    onProjectClick: () -> Unit,
    onReminderClick: () -> Unit,
    onMoreClick: () -> Unit
) {
    val zone = ZoneId.systemDefault()
    val dateFormatter = DateTimeFormatter.ofPattern("MMM d")
    val timeFormatter = DateTimeFormatter.ofPattern("h:mm a")
    val dueLabel = parsed.dueAt?.let {
        val dt = Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime()
        if (parsed.allDay) {
            dt.toLocalDate().format(dateFormatter)
        } else {
            dt.format(DateTimeFormatter.ofPattern("MMM d, h:mm a"))
        }
    } ?: "Date"
    val priorityLabel = parsed.priority.name
    val reminderLabel = when {
        parsed.reminders.isNotEmpty() -> {
            if (parsed.reminders.size > 1) {
                "${parsed.reminders.size} reminders"
            } else {
                when (val spec = parsed.reminders.first()) {
                    is ReminderSpec.Absolute -> {
                        val dt = Instant.ofEpochMilli(spec.timeAtMillis).atZone(zone).toLocalDateTime()
                        "At ${dt.format(timeFormatter)}"
                    }
                    is ReminderSpec.Offset -> "${spec.minutes}m before"
                }
            }
        }
        parsed.dueAt != null && !parsed.allDay -> {
            val dt = Instant.ofEpochMilli(parsed.dueAt).atZone(zone).toLocalDateTime()
            "At ${dt.format(timeFormatter)}"
        }
        else -> "Reminders"
    }
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        val actionChips: List<QuickAddChip> = listOf(
            QuickAddChip.Date(dueLabel, onDueClick),
            QuickAddChip.Priority(priorityLabel, onPriorityClick),
            QuickAddChip.Reminder(reminderLabel, onReminderClick),
            QuickAddChip.More(onMoreClick)
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(actionChips) { chip ->
                when (chip) {
                    is QuickAddChip.Date -> AssistChip(
                        onClick = chip.onClick,
                        label = { Text(chip.label) },
                        leadingIcon = { Icon(Icons.Default.CalendarMonth, contentDescription = null) }
                    )
                    is QuickAddChip.Priority -> AssistChip(
                        onClick = chip.onClick,
                        label = { Text(chip.label) },
                        leadingIcon = { Icon(Icons.Default.Flag, contentDescription = null) }
                    )
                    is QuickAddChip.Reminder -> AssistChip(
                        onClick = chip.onClick,
                        label = { Text(chip.label) },
                        leadingIcon = { Icon(Icons.Default.Notifications, contentDescription = null) }
                    )
                    is QuickAddChip.More -> AssistChip(
                        onClick = chip.onClick,
                        label = { Icon(Icons.Default.MoreHoriz, contentDescription = "More") }
                    )
                }
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AssistChip(
                onClick = onProjectClick,
                label = { Text(parsed.projectName?.let { "#${it}" } ?: "#Inbox") },
                leadingIcon = { Icon(Icons.Default.Folder, contentDescription = null) },
                trailingIcon = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) }
            )
        }
    }
}

private sealed class QuickAddChip {
    data class Date(val label: String, val onClick: () -> Unit) : QuickAddChip()
    data class Priority(val label: String, val onClick: () -> Unit) : QuickAddChip()
    data class Reminder(val label: String, val onClick: () -> Unit) : QuickAddChip()
    data class More(val onClick: () -> Unit) : QuickAddChip()
}

@Composable
private fun rememberTokenHighlighter(): VisualTransformation {
    val highlight = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
    return remember(highlight) {
        VisualTransformation { text ->
            TransformedText(
                highlightTokens(text.text, highlight),
                OffsetMapping.Identity
            )
        }
    }
}

private fun highlightTokens(text: String, color: androidx.compose.ui.graphics.Color): AnnotatedString {
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
