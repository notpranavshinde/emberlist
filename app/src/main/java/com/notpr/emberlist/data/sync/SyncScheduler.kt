package com.notpr.emberlist.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

interface SyncJobScheduler {
    fun scheduleStartup(context: Context)
    fun scheduleDebounced(context: Context, delayMs: Long)
    fun schedulePeriodic(context: Context)
    fun cancelPending(context: Context)
    fun cancelPeriodic(context: Context)
}

object SyncScheduler : SyncJobScheduler {
    private const val STARTUP_WORK_NAME = "cloud_sync_startup"
    private const val DEBOUNCED_WORK_NAME = "cloud_sync_debounced"
    private const val PERIODIC_WORK_NAME = "cloud_sync_periodic"
    private const val PERIODIC_HOURS = 6L
    private const val BACKOFF_SECONDS = 30L

    private fun connectedConstraints(): Constraints =
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

    override fun scheduleStartup(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(connectedConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(STARTUP_WORK_NAME)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(STARTUP_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    override fun scheduleDebounced(context: Context, delayMs: Long) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(connectedConstraints())
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(DEBOUNCED_WORK_NAME)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(DEBOUNCED_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    override fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(PERIODIC_HOURS, TimeUnit.HOURS)
            .setConstraints(connectedConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(PERIODIC_WORK_NAME)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    override fun cancelPending(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(STARTUP_WORK_NAME)
        WorkManager.getInstance(context).cancelUniqueWork(DEBOUNCED_WORK_NAME)
    }

    override fun cancelPeriodic(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
    }
}
