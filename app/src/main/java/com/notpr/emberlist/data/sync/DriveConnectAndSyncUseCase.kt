package com.notpr.emberlist.data.sync

import android.content.Intent
import com.notpr.emberlist.data.settings.SettingsRepository

sealed interface DriveConnectAndSyncResult {
    data class Success(val result: SyncResult.Success) : DriveConnectAndSyncResult
    data class AuthorizationRequired(val intent: Intent) : DriveConnectAndSyncResult
    data object Cancelled : DriveConnectAndSyncResult
    data class Failure(val message: String) : DriveConnectAndSyncResult
}

class DriveConnectAndSyncUseCase(
    private val authManager: DriveAuthManager,
    private val syncService: DriveSyncService,
    private val settingsRepository: SettingsRepository,
    private val statusTracker: SyncStatusTracker
) {
    fun authorizationIntent(): Intent = authManager.signInIntent()

    suspend fun connectResult(data: Intent?): DriveConnectAndSyncResult {
        if (data == null) return DriveConnectAndSyncResult.Cancelled
        val result = authManager.handleSignInResult(data)
        if (!result.state.hasDriveScope) {
            settingsRepository.updateSyncEnabled(false)
            return DriveConnectAndSyncResult.Failure(
                result.errorMessage ?: "Google sign-in did not return a usable account."
            )
        }
        settingsRepository.updateSyncEnabled(true)
        return syncAuthorized()
    }

    suspend fun start(): DriveConnectAndSyncResult {
        authManager.refreshState()
        return if (authManager.state.value.hasDriveScope) {
            settingsRepository.updateSyncEnabled(true)
            syncAuthorized()
        } else {
            DriveConnectAndSyncResult.AuthorizationRequired(authManager.signInIntent())
        }
    }

    suspend fun disconnect() {
        authManager.disconnect()
        settingsRepository.updateSyncEnabled(false)
    }

    private suspend fun syncAuthorized(): DriveConnectAndSyncResult {
        statusTracker.setSyncing(true)
        statusTracker.clearError()
        return try {
            when (val result = syncService.sync()) {
                is SyncResult.Success -> {
                    settingsRepository.updateLastSyncedAt(result.syncedAt)
                    statusTracker.onSyncSuccess()
                    DriveConnectAndSyncResult.Success(result)
                }
                is SyncResult.Failure -> {
                    statusTracker.onSyncFailure(result.message)
                    DriveConnectAndSyncResult.Failure(result.message)
                }
            }
        } finally {
            statusTracker.setSyncing(false)
        }
    }
}
