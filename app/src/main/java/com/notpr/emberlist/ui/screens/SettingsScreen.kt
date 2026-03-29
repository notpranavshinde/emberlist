package com.notpr.emberlist.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.backup.BackupScheduler
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(padding: PaddingValues) {
    val container = LocalAppContainer.current
    val viewModel: SettingsViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val settings by viewModel.settings.collectAsState()
    val driveAuthState by viewModel.driveAuthState.collectAsState()
    val syncUiState by viewModel.syncUiState.collectAsState()
    val context = LocalContext.current
    val backupManager = remember { container.backupManager }
    val scope = remember { CoroutineScope(Dispatchers.IO) }

    var importModeReplace by remember { mutableStateOf(true) }
    var showClearCompleted by remember { mutableStateOf(false) }
    var showRestoreDialog by remember { mutableStateOf(false) }
    var showConfirmRestore by remember { mutableStateOf(false) }
    var selectedBackup by remember { mutableStateOf<File?>(null) }
    var backups by remember { mutableStateOf<List<File>>(emptyList()) }

    fun refreshBackups() {
        val dir = File(context.filesDir, "backup")
        backups = if (dir.exists()) {
            dir.listFiles()?.filter { it.extension == "json" }?.sortedByDescending { it.lastModified() }.orEmpty()
        } else {
            emptyList()
        }
    }

    LaunchedEffect(Unit) {
        refreshBackups()
    }
    LaunchedEffect(settings.autoBackupDaily) {
        if (settings.autoBackupDaily) {
            BackupScheduler.schedule(context.applicationContext)
        } else {
            BackupScheduler.cancel(context.applicationContext)
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) {
            scope.launch { backupManager.exportToUri(context, context.contentResolver, uri) }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            scope.launch { backupManager.importFromUri(context.contentResolver, uri, importModeReplace) }
        }
    }
    val driveSignInLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        viewModel.handleDriveSignInResult(result.data)
    }

    Column(modifier = Modifier.padding(padding).padding(16.dp)) {
        Text(text = "Settings", style = MaterialTheme.typography.headlineSmall)

        SectionHeader(text = "Preferences")
        DropdownRow(
            label = "Week start",
            value = if (settings.weekStart == 1) "Monday" else "Sunday",
            options = listOf("Monday", "Sunday"),
            onSelect = { value ->
                viewModel.updateWeekStart(if (value == "Monday") 1 else 7)
            }
        )

        RowSwitch(label = "Use 24h time", checked = settings.use24h, onCheckedChange = viewModel::updateUse24h)
        RowSwitch(
            label = "Auto backup daily",
            checked = settings.autoBackupDaily,
            onCheckedChange = viewModel::updateAutoBackupDaily
        )
        RowSwitch(
            label = "Show completed in Today",
            checked = settings.showCompletedToday,
            onCheckedChange = viewModel::updateShowCompletedToday
        )

        SectionHeader(text = "Cloud Sync")
        Text(
            text = when {
                driveAuthState.hasDriveScope -> "Connected: ${driveAuthState.email ?: driveAuthState.displayName ?: "Google account"}"
                driveAuthState.isSignedIn -> "Google account connected, but Drive access is missing."
                else -> "Not connected"
            },
            style = MaterialTheme.typography.bodyMedium
        )
        settings.lastSyncedAt?.let { lastSyncedAt ->
            Text(
                text = "Last synced: ${formatTimestamp(lastSyncedAt)}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        syncUiState.status?.let { status ->
            Text(
                text = status,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        syncUiState.error?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        ActionRow {
            if (driveAuthState.hasDriveScope) {
                OutlinedButton(
                    onClick = { viewModel.disconnectDrive() },
                    modifier = Modifier.weight(1f)
                ) { Text("Disconnect") }
            } else {
                Button(
                    onClick = { driveSignInLauncher.launch(container.driveAuthManager.signInIntent()) },
                    modifier = Modifier.weight(1f)
                ) { Text("Connect Google") }
            }
            Button(
                onClick = { viewModel.syncNow() },
                enabled = settings.syncEnabled && driveAuthState.hasDriveScope && !syncUiState.isSyncing,
                modifier = Modifier.weight(1f)
            ) {
                if (syncUiState.isSyncing) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(16.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Sync now")
                }
            }
        }
        RowSwitch(
            label = "Enable sync",
            checked = settings.syncEnabled,
            onCheckedChange = viewModel::updateSyncEnabled,
            enabled = driveAuthState.hasDriveScope
        )

        SectionHeader(text = "Data")
        RowSwitch(
            label = "Replace on import",
            checked = importModeReplace,
            onCheckedChange = { importModeReplace = it }
        )
        ActionRow {
            OutlinedButton(
                onClick = { exportLauncher.launch("emberlist-backup.json") },
                modifier = Modifier.weight(1f)
            ) { Text("Export") }
            OutlinedButton(
                onClick = { importLauncher.launch(arrayOf("application/json")) },
                modifier = Modifier.weight(1f)
            ) { Text("Import") }
        }
        ActionRow {
            Button(
                onClick = {
                    scope.launch {
                        val file = backupManager.exportToFile(context)
                        refreshBackups()
                        withContext(Dispatchers.Main) {
                            Toast.makeText(context, "Backup saved: ${file.name}", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                modifier = Modifier.weight(1f)
            ) { Text("Backup now") }
            OutlinedButton(
                onClick = {
                    refreshBackups()
                    showRestoreDialog = true
                },
                modifier = Modifier.weight(1f)
            ) { Text("Restore backup") }
        }
        TextButton(onClick = { showClearCompleted = true }) {
            Text("Clear completed", color = MaterialTheme.colorScheme.error)
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

    if (showRestoreDialog) {
        AlertDialog(
            onDismissRequest = { showRestoreDialog = false },
            title = { Text("Restore backup") },
            text = {
                Column {
                    if (backups.isEmpty()) {
                        Text("No backups found.")
                    } else {
                        backups.forEach { file ->
                            TextButton(onClick = {
                                selectedBackup = file
                                showConfirmRestore = true
                            }) {
                                Text(file.name)
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showRestoreDialog = false }) { Text("Close") }
            }
        )
    }

    if (showConfirmRestore && selectedBackup != null) {
        AlertDialog(
            onDismissRequest = { showConfirmRestore = false },
            title = { Text("Restore backup") },
            text = { Text("This will replace your current data. Continue?") },
            confirmButton = {
                TextButton(onClick = {
                    val file = selectedBackup
                    if (file != null) {
                        scope.launch {
                            backupManager.importFromFile(file, replace = true)
                            showConfirmRestore = false
                            showRestoreDialog = false
                            withContext(Dispatchers.Main) {
                                Toast.makeText(context, "Restored ${file.name}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }) { Text("Restore") }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmRestore = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun RowSwitch(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label)
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
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

@Composable
private fun SectionHeader(text: String) {
    Spacer(modifier = Modifier.height(16.dp))
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
    )
    Divider(modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
}

@Composable
private fun ActionRow(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content
    )
}

private fun formatTimestamp(value: Long): String =
    SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(value))
