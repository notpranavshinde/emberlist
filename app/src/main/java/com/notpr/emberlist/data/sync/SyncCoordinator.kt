package com.notpr.emberlist.data.sync

import android.content.Context
import com.notpr.emberlist.data.settings.SettingsState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class SyncCoordinator(
    private val context: Context,
    private val settingsFlow: Flow<SettingsState>,
    private val authFlow: Flow<DriveAuthState>,
    private val invalidationFlow: Flow<Unit>,
    private val scheduler: SyncJobScheduler = SyncScheduler,
    private val nowProvider: () -> Long = System::currentTimeMillis,
    private val syncQuietPeriodMs: Long = 15_000L,
    private val debounceDelayMs: Long = 5_000L,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {
    @Volatile
    private var started = false

    @Volatile
    private var lastSyncedAt: Long? = null

    private var invalidationJob: Job? = null
    private var hasEverBeenActive = false

    fun start() {
        if (started) return
        started = true

        scope.launch {
            settingsFlow
                .mapDistinctLastSyncedAt()
                .collect { lastSyncedAt = it }
        }

        scope.launch {
            combine(
                settingsFlow.mapDistinctSyncEnabled(),
                authFlow.mapDistinctHasDriveScope()
            ) { syncEnabled, hasDriveScope -> syncEnabled && hasDriveScope }
                .distinctUntilChanged()
                .collect { active -> onActiveStateChanged(active) }
        }
    }

    fun stop() {
        if (!started) return
        started = false
        scope.cancel()
    }

    private fun onActiveStateChanged(active: Boolean) {
        if (!active) {
            invalidationJob?.cancel()
            invalidationJob = null
            if (hasEverBeenActive) {
                scheduler.cancelPending(context)
                scheduler.cancelPeriodic(context)
            }
            return
        }

        hasEverBeenActive = true
        if (invalidationJob?.isActive == true) return

        scheduler.schedulePeriodic(context)
        scheduler.scheduleStartup(context)
        invalidationJob = scope.launch {
            invalidationFlow.collect {
                val lastSync = lastSyncedAt
                if (lastSync != null && nowProvider() - lastSync < syncQuietPeriodMs) return@collect
                scheduler.scheduleDebounced(context, debounceDelayMs)
            }
        }
    }

    private fun Flow<SettingsState>.mapDistinctLastSyncedAt(): Flow<Long?> =
        map { it.lastSyncedAt }.distinctUntilChanged()

    private fun Flow<SettingsState>.mapDistinctSyncEnabled(): Flow<Boolean> =
        map { it.syncEnabled }.distinctUntilChanged()

    private fun Flow<DriveAuthState>.mapDistinctHasDriveScope(): Flow<Boolean> =
        map { it.hasDriveScope }.distinctUntilChanged()
}
