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

        return try {
            when (container.driveConnectAndSync.start()) {
                is DriveConnectAndSyncResult.Success -> {
                    Result.success()
                }
                is DriveConnectAndSyncResult.Failure -> {
                    Result.retry()
                }
                DriveConnectAndSyncResult.Cancelled,
                is DriveConnectAndSyncResult.AuthorizationRequired -> Result.success()
            }
        } finally {
            container.syncStatusTracker.setSyncing(false)
        }
    }
}
