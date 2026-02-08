package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun ActivityScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: ActivityViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val events by viewModel.events.collectAsState()
    val zone = ZoneId.systemDefault()
    val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
    val json = remember { Json { ignoreUnknownKeys = true } }

    LazyColumn(
        contentPadding = padding,
        modifier = Modifier.background(MaterialTheme.colorScheme.background)
    ) {
        item(key = "activity_header") {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(text = "Activity", style = MaterialTheme.typography.headlineSmall)
                Text(
                    text = "${events.size} events",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        items(events, key = { it.id }) { event ->
            val timestamp = Instant.ofEpochMilli(event.createdAt).atZone(zone).format(formatter)
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                val detail = taskDetailLabel(event, json)
                Text(text = detail ?: eventTitle(event), style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = timestamp,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

private fun eventTitle(event: ActivityEventEntity): String {
    val prefix = when (event.objectType) {
        ObjectType.TASK -> "Task"
        ObjectType.PROJECT -> "Project"
        ObjectType.SECTION -> "Section"
        ObjectType.REMINDER -> "Reminder"
    }
    val action = when (event.type) {
        ActivityType.CREATED -> "created"
        ActivityType.UPDATED -> "updated"
        ActivityType.COMPLETED -> "completed"
        ActivityType.UNCOMPLETED -> "uncompleted"
        ActivityType.ARCHIVED -> "archived"
        ActivityType.UNARCHIVED -> "unarchived"
        ActivityType.DELETED -> "deleted"
        ActivityType.REMINDER_SCHEDULED -> "reminder scheduled"
    }
    return "$prefix $action"
}

private fun taskDetailLabel(event: ActivityEventEntity, json: Json): String? {
    if (event.objectType != ObjectType.TASK) return null
    return try {
        val payload = json.parseToJsonElement(event.payloadJson).jsonObject
        val title = payload["title"]?.jsonPrimitive?.content
        if (title.isNullOrBlank()) null else "${event.type.name.lowercase().replaceFirstChar { it.uppercase() }}: $title"
    } catch (_: Exception) {
        null
    }
}
