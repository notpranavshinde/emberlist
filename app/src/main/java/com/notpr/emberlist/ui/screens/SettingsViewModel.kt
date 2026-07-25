package com.notpr.emberlist.ui.screens

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.settings.SettingsState
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.onboarding.OnboardingRepository
import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.DriveAuthState
import com.notpr.emberlist.data.sync.DriveConnectAndSyncUseCase
import com.notpr.emberlist.data.sync.DriveConnectAndSyncResult
import com.notpr.emberlist.data.sync.SyncRuntimeStatus
import com.notpr.emberlist.data.sync.SyncStatusTracker
import com.notpr.emberlist.data.analytics.OnboardingAnalytics
import com.notpr.emberlist.reminders.ReminderScheduler
import java.io.File
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val context: Context,
    private val database: EmberlistDatabase,
    private val settingsRepository: SettingsRepository,
    private val repository: TaskRepository,
    private val driveAuthManager: DriveAuthManager,
    private val syncStatusTracker: SyncStatusTracker,
    private val onboardingAnalytics: OnboardingAnalytics,
    private val driveConnectAndSync: DriveConnectAndSyncUseCase,
    private val reminderScheduler: ReminderScheduler,
    private val onboardingRepository: OnboardingRepository
) : ViewModel() {
    val settings: StateFlow<SettingsState> = settingsRepository.settings
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            SettingsState(1, false, "Ember", false, false, false, null, true)
        )
    val workspaceHasContent: StateFlow<Boolean> = combine(
        repository.observeWorkspaceTaskCount(),
        repository.observeProjects(),
        repository.observeAllSections()
    ) { taskCount, projects, sections ->
        taskCount > 0 || projects.isNotEmpty() || sections.isNotEmpty()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val driveAuthState: StateFlow<DriveAuthState> = driveAuthManager.state
    val syncRuntimeStatus: StateFlow<SyncRuntimeStatus> = syncStatusTracker.state
    private val _syncUiState = MutableStateFlow(SyncUiState())
    val syncUiState: StateFlow<SyncUiState> = _syncUiState.asStateFlow()

    fun updateWeekStart(value: Int) {
        viewModelScope.launch { settingsRepository.updateWeekStart(value) }
    }

    fun updateUse24h(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateUse24h(value) }
    }

    fun updateAccent(value: String) {
        viewModelScope.launch { settingsRepository.updateAccent(value) }
    }

    fun updateAutoBackupDaily(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateAutoBackupDaily(value) }
    }

    fun updateShowCompletedToday(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateShowCompletedToday(value) }
    }

    fun updateAnalyticsEnabled(value: Boolean) {
        viewModelScope.launch {
            settingsRepository.updateAnalyticsEnabled(value)
            if (!value) onboardingAnalytics.clearQueueAndId()
        }
    }

    fun resetAnalyticsId() {
        viewModelScope.launch { onboardingAnalytics.resetInstallId() }
    }

    fun signOut() {
        viewModelScope.launch {
            if (_syncUiState.value.isSyncing) return@launch
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Syncing before sign out…")
            when (val result = driveConnectAndSync.start()) {
                is DriveConnectAndSyncResult.Success -> {
                    reminderScheduler.cancelAll()
                    database.clearAllTables()
                    File(context.filesDir, "backup").deleteRecursively()
                    onboardingRepository.resetForSignedOutWorkspace()
                    driveConnectAndSync.disconnect()
                    _syncUiState.value = SyncUiState(status = "Signed out. Local workspace data was cleared.")
                }
                is DriveConnectAndSyncResult.Failure ->
                    _syncUiState.value = SyncUiState(error = "Could not sign out safely: ${result.message}")
                DriveConnectAndSyncResult.Cancelled,
                is DriveConnectAndSyncResult.AuthorizationRequired ->
                    _syncUiState.value = SyncUiState(error = "Reconnect to Google Drive to sync before signing out.")
            }
        }
    }

    fun syncNow() {
        viewModelScope.launch {
            syncNowInternal()
        }
    }

    fun replaceCorruptCloudWorkspace() {
        viewModelScope.launch {
            if (_syncUiState.value.isSyncing) return@launch
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Replacing unreadable cloud workspace…")
            when (val result = driveConnectAndSync.replaceCorruptRemoteWithLocal()) {
                is DriveConnectAndSyncResult.Success -> {
                    _syncUiState.value = SyncUiState(
                        status = "The unreadable cloud workspace was replaced with this device's cached workspace."
                    )
                }
                is DriveConnectAndSyncResult.Failure -> {
                    _syncUiState.value = SyncUiState(error = result.message)
                }
                DriveConnectAndSyncResult.Cancelled,
                is DriveConnectAndSyncResult.AuthorizationRequired ->
                    _syncUiState.value = SyncUiState(error = "Reconnect to the account that owns this device cache.")
            }
        }
    }

    private suspend fun syncNowInternal(connectStatus: String? = null) {
        if (_syncUiState.value.isSyncing) return
        if (!driveAuthState.value.hasDriveScope) {
            _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
            return
        }
        _syncUiState.value = SyncUiState(isSyncing = true, status = connectStatus ?: "Syncing…")
        when (val operation = driveConnectAndSync.start()) {
            is DriveConnectAndSyncResult.Success -> {
                val result = operation.result
                    onboardingAnalytics.track(
                        "sync_action",
                        mapOf("action" to "sync", "result" to "success", "origin" to "settings")
                    )
                    _syncUiState.value = SyncUiState(
                        status = if (connectStatus != null && result.remoteCreated) {
                            "Google Drive connected. Cloud sync file created."
                        } else if (connectStatus != null) {
                            "Google Drive connected. Workspace restored and synced."
                        } else if (result.remoteCreated) {
                            "Synced to Google Drive."
                        } else {
                            "Sync complete."
                        }
                    )
            }
            DriveConnectAndSyncResult.Cancelled -> {
                onboardingAnalytics.track("sync_action", mapOf("action" to "sync", "result" to "cancelled", "origin" to "settings"))
                _syncUiState.value = SyncUiState()
            }
            is DriveConnectAndSyncResult.Failure -> {
                onboardingAnalytics.track("sync_action", mapOf("action" to "sync", "result" to "failure", "origin" to "settings", "errorCategory" to normalizeAnalyticsError(operation.message)))
                _syncUiState.value = SyncUiState(error = operation.message)
            }
            is DriveConnectAndSyncResult.AuthorizationRequired -> _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
        }
    }

    fun clearCompleted() {
        viewModelScope.launch { repository.clearCompletedTasks() }
    }

}

data class SyncUiState(
    val isSyncing: Boolean = false,
    val status: String? = null,
    val error: String? = null
)

private fun normalizeAnalyticsError(message: String): String {
    val value = message.lowercase()
    return when {
        "offline" in value || "internet" in value -> "offline"
        "auth" in value || "sign" in value || "token" in value -> "auth"
        "schema" in value || "newer" in value -> "schema"
        "permission" in value -> "permission"
        "network" in value -> "network"
        else -> "unknown"
    }
}
