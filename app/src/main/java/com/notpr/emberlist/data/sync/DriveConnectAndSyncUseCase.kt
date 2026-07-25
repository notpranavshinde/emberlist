package com.notpr.emberlist.data.sync

import android.app.PendingIntent
import android.content.Intent
import com.notpr.emberlist.data.settings.SettingsRepository
import kotlinx.coroutines.flow.first

sealed interface DriveConnectAndSyncResult {
    data class Success(val result: SyncResult.Success) : DriveConnectAndSyncResult
    data class AuthorizationRequired(val pendingIntent: PendingIntent) : DriveConnectAndSyncResult
    data object Cancelled : DriveConnectAndSyncResult
    data class Failure(val message: String) : DriveConnectAndSyncResult
}

class DriveConnectAndSyncUseCase(
    private val authManager: DriveAuthManager,
    private val syncService: DriveSyncService,
    private val settingsRepository: SettingsRepository,
    private val statusTracker: SyncStatusTracker
) {
    suspend fun connectResult(data: Intent?): DriveConnectAndSyncResult {
        if (data == null) return DriveConnectAndSyncResult.Cancelled
        return consumeAuthorization(authManager.handleAuthorizationResult(data))
    }

    suspend fun start(selectAccount: Boolean = false): DriveConnectAndSyncResult =
        consumeAuthorization(authManager.authorize(selectAccount))

    suspend fun disconnect() {
        authManager.disconnect()
        settingsRepository.clearDriveWorkspaceBinding()
    }

    suspend fun replaceCorruptRemoteWithLocal(): DriveConnectAndSyncResult =
        when (val authorization = authManager.authorize()) {
            is DriveAuthorizationResult.ResolutionRequired ->
                DriveConnectAndSyncResult.AuthorizationRequired(authorization.pendingIntent)
            is DriveAuthorizationResult.Failure ->
                DriveConnectAndSyncResult.Failure(authorization.message)
            is DriveAuthorizationResult.Authorized -> {
                val binding = settingsRepository.driveWorkspace.first()
                if (!binding.isBound || binding.accountId != authorization.access.accountId) {
                    DriveConnectAndSyncResult.Failure(
                        "Sign in with ${binding.email ?: "the account that owns this device cache"} before replacing its cloud workspace."
                    )
                } else {
                    when (val result = syncService.replaceCorruptRemoteWithLocal()) {
                        is SyncResult.Success -> {
                            settingsRepository.updateLastSyncedAt(result.syncedAt)
                            settingsRepository.updateDrivePendingChanges(false)
                            statusTracker.onSyncSuccess()
                            DriveConnectAndSyncResult.Success(result)
                        }
                        is SyncResult.Failure -> {
                            statusTracker.onSyncFailure(result.message)
                            DriveConnectAndSyncResult.Failure(result.message)
                        }
                    }
                }
            }
        }

    private suspend fun consumeAuthorization(
        authorization: DriveAuthorizationResult
    ): DriveConnectAndSyncResult = when (authorization) {
        is DriveAuthorizationResult.ResolutionRequired ->
            DriveConnectAndSyncResult.AuthorizationRequired(authorization.pendingIntent)
        is DriveAuthorizationResult.Failure ->
            DriveConnectAndSyncResult.Failure(authorization.message)
        is DriveAuthorizationResult.Authorized -> {
            val binding = settingsRepository.driveWorkspace.first()
            if (binding.isBound && binding.accountId != authorization.access.accountId) {
                DriveConnectAndSyncResult.Failure(
                    "A different Google account owns this device cache. Sign in with ${binding.email ?: "the original account"}."
                )
            } else {
                syncAuthorized(authorization.access)
            }
        }
    }

    private suspend fun syncAuthorized(access: AuthorizedDriveAccess): DriveConnectAndSyncResult {
        statusTracker.setSyncing(true)
        statusTracker.clearError()
        return try {
            when (val result = syncService.sync()) {
                is SyncResult.Success -> {
                    settingsRepository.bindDriveWorkspace(
                        accountId = access.accountId,
                        email = access.email,
                        displayName = access.displayName
                    )
                    settingsRepository.updateLastSyncedAt(result.syncedAt)
                    settingsRepository.updateDrivePendingChanges(false)
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
