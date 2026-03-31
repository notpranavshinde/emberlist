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
import com.notpr.emberlist.data.sync.SyncResult
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val repository: TaskRepository,
    private val driveAuthManager: DriveAuthManager,
    private val driveSyncService: DriveSyncService
) : ViewModel() {
    val settings: StateFlow<SettingsState> = settingsRepository.settings
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            SettingsState(1, false, "Ember", false, false, false, null)
        )
    val driveAuthState: StateFlow<DriveAuthState> = driveAuthManager.state
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

    fun updateSyncEnabled(value: Boolean) {
        viewModelScope.launch {
            if (!driveAuthState.value.hasDriveScope && value) return@launch
            settingsRepository.updateSyncEnabled(value)
        }
    }

    fun handleDriveSignInResult(data: Intent?) {
        viewModelScope.launch {
            val result = driveAuthManager.handleSignInResult(data)
            val state = result.state
            if (state.hasDriveScope) {
                _syncUiState.value = SyncUiState(status = "Google Drive connected.")
            } else if (state.isSignedIn) {
                _syncUiState.value = SyncUiState(
                    error = result.errorMessage
                        ?: "Google account connected, but Drive access is still missing. Disconnect and reconnect if this keeps happening."
                )
                settingsRepository.updateSyncEnabled(false)
            } else {
                _syncUiState.value = SyncUiState(error = result.errorMessage ?: "Google sign-in did not return a usable account.")
                settingsRepository.updateSyncEnabled(false)
            }
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
            if (_syncUiState.value.isSyncing) return@launch
            if (!settings.value.syncEnabled) {
                _syncUiState.value = SyncUiState(error = "Enable sync first.")
                return@launch
            }
            if (!driveAuthState.value.hasDriveScope) {
                _syncUiState.value = SyncUiState(error = "Connect Google Drive first.")
                return@launch
            }
            _syncUiState.value = SyncUiState(isSyncing = true, status = "Syncing…")
            when (val result = driveSyncService.sync()) {
                is SyncResult.Success -> {
                    settingsRepository.updateLastSyncedAt(result.syncedAt)
                    _syncUiState.value = SyncUiState(
                        status = if (result.remoteCreated) "Synced to Google Drive." else "Sync complete."
                    )
                }
                is SyncResult.Failure -> {
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
