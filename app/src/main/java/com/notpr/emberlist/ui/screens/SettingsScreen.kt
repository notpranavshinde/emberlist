package com.notpr.emberlist.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import com.notpr.emberlist.data.backup.BackupManager
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(padding: PaddingValues) {
    val container = LocalAppContainer.current
    val viewModel: SettingsViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val settings by viewModel.settings.collectAsState()
    val context = LocalContext.current
    val backupManager = remember { BackupManager(container.database) }
    val scope = remember { CoroutineScope(Dispatchers.IO) }

    var importModeReplace by remember { mutableStateOf(true) }
    var showClearCompleted by remember { mutableStateOf(false) }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) {
            scope.launch { backupManager.exportToUri(context.contentResolver, uri) }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            scope.launch { backupManager.importFromUri(context.contentResolver, uri, importModeReplace) }
        }
    }

    Column(modifier = Modifier.padding(padding).padding(16.dp)) {
        Text(text = "Settings")

        DropdownRow(
            label = "Week start",
            value = if (settings.weekStart == 1) "Monday" else "Sunday",
            options = listOf("Monday", "Sunday"),
            onSelect = { value ->
                viewModel.updateWeekStart(if (value == "Monday") 1 else 7)
            }
        )

        RowSwitch(label = "Use 24h time", checked = settings.use24h, onCheckedChange = viewModel::updateUse24h)

        OutlinedTextField(
            value = settings.defaultReminderOffset.toString(),
            onValueChange = { value -> value.toIntOrNull()?.let(viewModel::updateDefaultReminderOffset) },
            label = { Text("Default reminder offset (minutes)") },
            modifier = Modifier.fillMaxWidth()
        )

        Text(text = "Data")
        RowSwitch(
            label = "Replace on import",
            checked = importModeReplace,
            onCheckedChange = { importModeReplace = it }
        )
        Button(onClick = { exportLauncher.launch("emberlist-backup.json") }) {
            Text("Export")
        }
        Button(onClick = { importLauncher.launch(arrayOf("application/json")) }) {
            Text("Import")
        }
        Button(onClick = { showClearCompleted = true }) {
            Text("Clear completed")
        }
    }

    if (showClearCompleted) {
        AlertDialog(
            onDismissRequest = { showClearCompleted = false },
            title = { Text("Clear completed tasks") },
            text = { Text("This will remove all completed tasks from the database.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.clearCompleted()
                    showClearCompleted = false
                }) { Text("Clear") }
            },
            dismissButton = {
                TextButton(onClick = { showClearCompleted = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun RowSwitch(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun DropdownRow(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "$label: $value")
        TextButton(onClick = { open = true }) { Text("Change") }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column {
                    options.forEach { option ->
                        TextButton(onClick = {
                            onSelect(option)
                            open = false
                        }) { Text(option) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { open = false }) { Text("Close") }
            }
        )
    }
}
