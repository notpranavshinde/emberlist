package com.notpr.emberlist.data.backup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.notpr.emberlist.data.EmberlistDatabase

class BackupWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        return try {
            val db = EmberlistDatabase.build(applicationContext)
            val manager = BackupManager(db)
            manager.exportToFile(applicationContext)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
