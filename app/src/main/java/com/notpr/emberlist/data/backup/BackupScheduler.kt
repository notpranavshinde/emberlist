package com.notpr.emberlist.data.backup

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

object BackupScheduler {
    private const val WORK_NAME = "auto_backup_daily"

    fun schedule(context: Context) {
        val now = System.currentTimeMillis()
        val zone = ZoneId.systemDefault()
        val next = LocalDate.now(zone)
            .plusDays(1)
            .atTime(LocalTime.of(0, 30))
            .atZone(zone)
            .toInstant()
            .toEpochMilli()
        val delay = (next - now).coerceAtLeast(0L)
        val request = PeriodicWorkRequestBuilder<BackupWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }
}
