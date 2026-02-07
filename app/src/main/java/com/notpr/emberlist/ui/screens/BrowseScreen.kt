package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory

@Composable
fun BrowseScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: BrowseViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val projects by viewModel.projects.collectAsState()

    var showCreateDialog by remember { mutableStateOf(false) }
    var renameTarget by remember { mutableStateOf<com.notpr.emberlist.data.model.ProjectEntity?>(null) }

    LazyColumn(contentPadding = padding) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Projects")
                Button(onClick = { showCreateDialog = true }) { Text("New") }
            }
        }
        items(projects, key = { it.id }) { project ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate("project/${project.id}") }
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text(text = project.name)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { renameTarget = project }) { Text("Rename") }
                    TextButton(onClick = { viewModel.toggleArchive(project) }) {
                        Text(if (project.archived) "Unarchive" else "Archive")
                    }
                }
            }
            Divider()
        }
        item {
            Text(text = "Settings", modifier = Modifier.padding(16.dp))
        }
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate("settings") }
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text(text = "Settings")
            }
        }
    }

    if (showCreateDialog) {
        ProjectDialog(
            title = "Create Project",
            initial = "",
            onDismiss = { showCreateDialog = false },
            onSave = {
                if (it.isNotBlank()) viewModel.createProject(it.trim())
                showCreateDialog = false
            }
        )
    }

    renameTarget?.let { target ->
        ProjectDialog(
            title = "Rename Project",
            initial = target.name,
            onDismiss = { renameTarget = null },
            onSave = {
                if (it.isNotBlank()) viewModel.renameProject(target, it.trim())
                renameTarget = null
            }
        )
    }
}

@Composable
private fun ProjectDialog(
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
