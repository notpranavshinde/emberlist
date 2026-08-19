package com.notpr.emberlist.ui.screens

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.settings.DriveWorkspaceState
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.settings.SettingsState
import com.notpr.emberlist.data.onboarding.OnboardingRepository
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
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val context: Context,
    private val database: EmberlistDatabase,
    private val settingsRepository: SettingsRepository,
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
            SettingsState(1, false, false, true, null, true)
        )
    val driveWorkspace: StateFlow<DriveWorkspaceState> = settingsRepository.driveWorkspace
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            DriveWorkspaceState(null, null, null, false, false)
        )
    val syncRuntimeStatus: StateFlow<SyncRuntimeStatus> = syncStatusTracker.state
    private val _syncUiState = MutableStateFlow(SyncUiState())
    val syncUiState: StateFlow<SyncUiState> = _syncUiState.asStateFlow()

    fun updateWeekStart(value: Int) {
        viewModelScope.launch { settingsRepository.updateWeekStart(value) }
    }

    fun updateUse24h(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateUse24h(value) }
    }

    fun updateShowCompletedToday(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateShowCompletedToday(value) }
    }

    fun updateTodaySortMode(value: String) {
        viewModelScope.launch { settingsRepository.updateTodaySortMode(value) }
    }

    fun updateTodayGroupMode(value: String) {
        viewModelScope.launch { settingsRepository.updateTodayGroupMode(value) }
    }

    fun updateAnalyticsEnabled(value: Boolean) {
        viewModelScope.launch {
            settingsRepository.updateAnalyticsEnabled(value)
            if (!value) onboardingAnalytics.clearQueueAndId()
        }
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

    fun syncNow(onAuthorizationRequired: (PendingIntent) -> Unit) {
        viewModelScope.launch {
            if (_syncUiState.value.isSyncing) return@launch
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Syncing…")
            handleSyncResult(driveConnectAndSync.start(), onAuthorizationRequired)
        }
    }

    fun handleSyncAuthorizationResult(data: Intent?) {
        viewModelScope.launch {
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Syncing…")
            handleSyncResult(driveConnectAndSync.connectResult(data))
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

    private suspend fun handleSyncResult(
        operation: DriveConnectAndSyncResult,
        onAuthorizationRequired: ((PendingIntent) -> Unit)? = null
    ) {
        when (operation) {
            is DriveConnectAndSyncResult.Success -> {
                val result = operation.result
                onboardingAnalytics.track(
                    "sync_action",
                    mapOf("action" to "sync", "result" to "success", "origin" to "settings")
                )
                _syncUiState.value = SyncUiState(
                    status = if (result.remoteCreated) {
                        "Synced to Google Drive."
                    } else {
                        "Sync complete."
                    }
                )
            }
            DriveConnectAndSyncResult.Cancelled -> {
                onboardingAnalytics.track(
                    "sync_action",
                    mapOf("action" to "sync", "result" to "cancelled", "origin" to "settings")
                )
                _syncUiState.value = SyncUiState()
            }
            is DriveConnectAndSyncResult.Failure -> {
                onboardingAnalytics.track(
                    "sync_action",
                    mapOf(
                        "action" to "sync",
                        "result" to "failure",
                        "origin" to "settings",
                        "errorCategory" to normalizeAnalyticsError(operation.message)
                    )
                )
                _syncUiState.value = SyncUiState(error = operation.message)
            }
            is DriveConnectAndSyncResult.AuthorizationRequired -> {
                _syncUiState.value = SyncUiState(status = "Waiting for Google authorization…")
                if (onAuthorizationRequired == null) {
                    _syncUiState.value = SyncUiState(error = "Reconnect to Google Drive and try again.")
                } else {
                    onAuthorizationRequired(operation.pendingIntent)
                }
            }
        }
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
