package com.notpr.emberlist.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun TodayScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TodayViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val tasks by viewModel.tasks.collectAsState()
    val overdue = tasks.filter { it.isOverdue }
    val today = tasks.filterNot { it.isOverdue }
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

    LazyColumn(
        contentPadding = padding,
        modifier = Modifier.background(MaterialTheme.colorScheme.background)
    ) {
        item(key = "today_header") {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(text = "Today", style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "${tasks.size} tasks",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        if (overdue.isNotEmpty()) {
            item(key = "overdue_header") {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "Overdue", style = MaterialTheme.typography.titleSmall)
                    TextButton(onClick = { /* visual only */ }) {
                        Text(text = "Reschedule")
                    }
                }
            }
            items(overdue, key = { it.task.id }) { item ->
                TaskRow(
                    item = item,
                    onToggle = viewModel::toggleComplete,
                    onReschedule = { rescheduleTarget = it },
                    onDelete = viewModel::deleteTask,
                    onClick = { navController.navigate("task/${item.task.id}") }
                )
            }
        }
        items(today, key = { it.task.id }) { item ->
            TaskRow(
                item = item,
                onToggle = viewModel::toggleComplete,
                onReschedule = { rescheduleTarget = it },
                onDelete = viewModel::deleteTask,
                onClick = { navController.navigate("task/${item.task.id}") }
            )
        }
    }
}
