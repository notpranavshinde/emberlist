package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.settings.SettingsState
import com.notpr.emberlist.data.TaskRepository
import android.content.Intent
import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.DriveAuthState
import com.notpr.emberlist.data.sync.DriveSyncService
import com.notpr.emberlist.data.sync.DriveConnectAndSyncUseCase
import com.notpr.emberlist.data.sync.DriveConnectAndSyncResult
import com.notpr.emberlist.data.sync.SyncRuntimeStatus
import com.notpr.emberlist.data.sync.SyncResult
import com.notpr.emberlist.data.sync.SyncStatusTracker
import com.notpr.emberlist.data.analytics.OnboardingAnalytics
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val repository: TaskRepository,
    private val driveAuthManager: DriveAuthManager,
    private val driveSyncService: DriveSyncService,
    private val syncStatusTracker: SyncStatusTracker,
    private val onboardingAnalytics: OnboardingAnalytics,
    private val driveConnectAndSync: DriveConnectAndSyncUseCase
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

    init {
        driveAuthManager.refreshState()
    }

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
            if (!value) onboardingAnalytics.clearQueue()
        }
    }

    fun updateSyncEnabled(value: Boolean) {
        viewModelScope.launch {
            if (!driveAuthState.value.hasDriveScope && value) return@launch
            settingsRepository.updateSyncEnabled(value)
        }
    }

    fun handleDriveSignInResult(data: Intent?) {
        viewModelScope.launch {
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Google Drive connected. Syncing your workspace…")
            when (val result = driveConnectAndSync.connectResult(data)) {
                is DriveConnectAndSyncResult.Success -> _syncUiState.value = SyncUiState(
                    status = if (result.result.remoteCreated) "Google Drive connected. Cloud sync file created."
                    else "Google Drive connected. Workspace restored and synced."
                )
                DriveConnectAndSyncResult.Cancelled -> _syncUiState.value = SyncUiState()
                is DriveConnectAndSyncResult.Failure -> _syncUiState.value = SyncUiState(error = result.message)
                is DriveConnectAndSyncResult.AuthorizationRequired -> _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
            }
        }
    }

    fun enableSyncAndSyncNow() {
        viewModelScope.launch {
            if (!driveAuthState.value.hasDriveScope) {
                _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
                return@launch
            }
            settingsRepository.updateSyncEnabled(true)
            syncNowInternal(connectStatus = "Syncing your Google Drive workspace…")
        }
    }

    fun disconnectDrive() {
        viewModelScope.launch {
            driveAuthManager.disconnect()
            settingsRepository.updateSyncEnabled(false)
            _syncUiState.value = SyncUiState(status = "Disconnected from Google.")
        }
    }

    fun syncNow() {
        viewModelScope.launch {
            syncNowInternal()
        }
    }

    private suspend fun syncNowInternal(connectStatus: String? = null) {
        if (_syncUiState.value.isSyncing) return
        if (!settings.value.syncEnabled && connectStatus == null) {
            _syncUiState.value = SyncUiState(error = "Enable sync first.")
            return
        }
        if (!driveAuthState.value.hasDriveScope) {
            _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
            return
        }
        _syncUiState.value = SyncUiState(isSyncing = true, status = connectStatus ?: "Syncing…")
        when (val operation = driveConnectAndSync.start()) {
            is DriveConnectAndSyncResult.Success -> {
                val result = operation.result
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
            DriveConnectAndSyncResult.Cancelled -> _syncUiState.value = SyncUiState()
            is DriveConnectAndSyncResult.Failure -> _syncUiState.value = SyncUiState(error = operation.message)
            is DriveConnectAndSyncResult.AuthorizationRequired -> _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
        }
    }

    fun resetCloudSync() {
        viewModelScope.launch {
            if (_syncUiState.value.isSyncing) return@launch
            if (!driveAuthState.value.hasDriveScope) {
                _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
                return@launch
            }
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Resetting cloud sync…")
            when (val result = driveSyncService.resetRemoteSyncFile()) {
                is SyncResult.Success -> {
                    settingsRepository.updateLastSyncedAt(null)
                    syncStatusTracker.clearError()
                    _syncUiState.value = SyncUiState(status = "Cloud sync file deleted. Sync again to recreate it.")
                }
                is SyncResult.Failure -> {
                    syncStatusTracker.onSyncFailure(result.message)
                    _syncUiState.value = SyncUiState(error = result.message)
                }
            }
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
