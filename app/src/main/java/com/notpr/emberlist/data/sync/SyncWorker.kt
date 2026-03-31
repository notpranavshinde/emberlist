package com.notpr.emberlist.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.notpr.emberlist.EmberlistApp
import kotlinx.coroutines.flow.first

class SyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? EmberlistApp ?: return Result.failure()
        val container = app.container
        container.syncStatusTracker.setSyncing(true)
        val settings = container.settingsRepository.settings.first()
        if (!settings.syncEnabled) {
            container.syncStatusTracker.setSyncing(false)
            return Result.success()
        }

        container.driveAuthManager.refreshState()
        if (!container.driveAuthManager.state.value.hasDriveScope) {
            container.syncStatusTracker.setSyncing(false)
            return Result.success()
        }

        return try {
            when (val result = container.driveSyncService.sync()) {
                is SyncResult.Success -> {
                    container.settingsRepository.updateLastSyncedAt(result.syncedAt)
                    container.syncStatusTracker.onSyncSuccess()
                    Result.success()
                }
                is SyncResult.Failure -> {
                    container.syncStatusTracker.onSyncFailure(result.message)
                    Result.retry()
                }
            }
        } finally {
            container.syncStatusTracker.setSyncing(false)
        }
    }
}
