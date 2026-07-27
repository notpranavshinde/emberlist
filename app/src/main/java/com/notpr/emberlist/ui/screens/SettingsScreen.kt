package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(padding: PaddingValues) {
    val container = LocalAppContainer.current
    val viewModel: SettingsViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val settings by viewModel.settings.collectAsState()
    val driveAuthState by viewModel.driveAuthState.collectAsState()
    val syncRuntimeStatus by viewModel.syncRuntimeStatus.collectAsState()
    val syncUiState by viewModel.syncUiState.collectAsState()
    var showReplaceCorruptCloud by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(text = "Settings", style = MaterialTheme.typography.headlineSmall)

        SectionHeader(text = "Cloud sync")
        InfoRow(
            label = "Account",
            value = driveAuthState.email
                ?: driveAuthState.displayName
                ?: "Not connected"
        )
        InfoRow(
            label = "Last sync",
            value = settings.lastSyncedAt?.let(::formatTimestamp) ?: "No recent sync"
        )
        InfoRow(
            label = "Status",
            value = syncStatusText(
                driveConnected = driveAuthState.hasDriveScope,
                runtimeStatus = syncRuntimeStatus
            )
        )
        syncUiState.status?.let { status ->
            Text(
                text = status,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        syncUiState.error?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
            if (error.contains("invalid or corrupted", ignoreCase = true)) {
                TextButton(onClick = { showReplaceCorruptCloud = true }) {
                    Text("Replace unreadable cloud workspace")
                }
            }
        }
        if (syncUiState.error == null) {
            syncRuntimeStatus.lastError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
        ActionRow {
            OutlinedButton(
                onClick = viewModel::signOut,
                enabled = !syncUiState.isSyncing,
                modifier = Modifier.weight(1f)
            ) {
                Text("Sign out")
            }
            Button(
                onClick = viewModel::syncNow,
                enabled = driveAuthState.hasDriveScope && !syncUiState.isSyncing,
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

        SectionHeader(text = "Preferences")
        RowSwitch(
            label = "Anonymous analytics",
            checked = settings.analyticsEnabled,
            onCheckedChange = viewModel::updateAnalyticsEnabled
        )
        RowSwitch(
            label = "Show completed in Today",
            checked = settings.showCompletedToday,
            onCheckedChange = viewModel::updateShowCompletedToday
        )
        RowSwitch(
            label = "Use 24-hour time",
            checked = settings.use24h,
            onCheckedChange = viewModel::updateUse24h
        )
        DropdownRow(
            label = "Week starts on",
            value = if (settings.weekStart == 1) "Monday" else "Sunday",
            options = listOf("Monday", "Sunday"),
            onSelect = { value ->
                viewModel.updateWeekStart(if (value == "Monday") 1 else 7)
            }
        )
    }

    if (showReplaceCorruptCloud) {
        AlertDialog(
            onDismissRequest = { showReplaceCorruptCloud = false },
            title = { Text("Replace unreadable cloud workspace?") },
            text = {
                Text(
                    "This uploads this device's workspace over the unreadable " +
                        "Google Drive copy."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.replaceCorruptCloudWorkspace()
                        showReplaceCorruptCloud = false
                    }
                ) {
                    Text("Replace cloud copy")
                }
            },
            dismissButton = {
                TextButton(onClick = { showReplaceCorruptCloud = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

private fun syncStatusText(
    driveConnected: Boolean,
    runtimeStatus: com.notpr.emberlist.data.sync.SyncRuntimeStatus
): String {
    if (!driveConnected) return "Not connected"
    return when {
        runtimeStatus.isSyncing -> "Syncing"
        !runtimeStatus.isOnline -> "Offline"
        runtimeStatus.hasPendingLocalChanges -> "Pending changes"
        else -> "Ready"
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.width(16.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun RowSwitch(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
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
        Text(text = label)
        TextButton(onClick = { open = true }) {
            Text(value)
        }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column {
                    options.forEach { option ->
                        TextButton(
                            onClick = {
                                onSelect(option)
                                open = false
                            }
                        ) {
                            Text(option)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { open = false }) {
                    Text("Close")
                }
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
    HorizontalDivider(
        modifier = Modifier.padding(vertical = 8.dp),
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
    )
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
