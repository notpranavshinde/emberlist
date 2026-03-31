package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.settings.SettingsState
import com.notpr.emberlist.data.sync.DriveAuthState
import com.notpr.emberlist.data.sync.SyncCoordinator
import com.notpr.emberlist.data.sync.SyncJobScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalCoroutinesApi::class)
class SyncCoordinatorTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun startupSyncIsScheduledWhenSyncBecomesActive() = runTest {
        val settings = MutableStateFlow(settings(syncEnabled = false, lastSyncedAt = null))
        val auth = MutableStateFlow(DriveAuthState(isSignedIn = true, hasDriveScope = true))
        val invalidations = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 8)
        val scheduler = FakeSyncJobScheduler()
        val coordinatorScope = CoroutineScope(coroutineContext + SupervisorJob())
        val coordinator = SyncCoordinator(
            context = context,
            settingsFlow = settings,
            authFlow = auth,
            invalidationFlow = invalidations,
            scheduler = scheduler,
            scope = coordinatorScope
        )

        coordinator.start()
        advanceUntilIdle()
        assertEquals(0, scheduler.startupCount)
        assertEquals(0, scheduler.periodicCount)

        settings.value = settings(syncEnabled = true, lastSyncedAt = null)
        advanceUntilIdle()

        assertEquals(1, scheduler.startupCount)
        assertEquals(1, scheduler.periodicCount)
        coordinator.stop()
    }

    @Test
    fun localInvalidationSchedulesDebouncedSyncWhenActive() = runTest {
        val settings = MutableStateFlow(settings(syncEnabled = true, lastSyncedAt = null))
        val auth = MutableStateFlow(DriveAuthState(isSignedIn = true, hasDriveScope = true))
        val invalidations = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 8)
        val scheduler = FakeSyncJobScheduler()
        val coordinatorScope = CoroutineScope(coroutineContext + SupervisorJob())
        val coordinator = SyncCoordinator(
            context = context,
            settingsFlow = settings,
            authFlow = auth,
            invalidationFlow = invalidations,
            scheduler = scheduler,
            nowProvider = { 1_000L },
            debounceDelayMs = 4_000L,
            scope = coordinatorScope
        )

        coordinator.start()
        advanceUntilIdle()
        invalidations.tryEmit(Unit)
        advanceUntilIdle()

        assertEquals(listOf(4_000L), scheduler.debouncedDelays)
        coordinator.stop()
    }

    @Test
    fun recentSyncSuppressesDebouncedLocalSync() = runTest {
        val settings = MutableStateFlow(settings(syncEnabled = true, lastSyncedAt = 995L))
        val auth = MutableStateFlow(DriveAuthState(isSignedIn = true, hasDriveScope = true))
        val invalidations = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 8)
        val scheduler = FakeSyncJobScheduler()
        val coordinatorScope = CoroutineScope(coroutineContext + SupervisorJob())
        val coordinator = SyncCoordinator(
            context = context,
            settingsFlow = settings,
            authFlow = auth,
            invalidationFlow = invalidations,
            scheduler = scheduler,
            nowProvider = { 1_000L },
            syncQuietPeriodMs = 10_000L,
            scope = coordinatorScope
        )

        coordinator.start()
        advanceUntilIdle()
        invalidations.tryEmit(Unit)
        advanceUntilIdle()

        assertEquals(0, scheduler.debouncedDelays.size)
        coordinator.stop()
    }

    @Test
    fun disablingSyncCancelsPendingAndPeriodicWork() = runTest {
        val settings = MutableStateFlow(settings(syncEnabled = true, lastSyncedAt = null))
        val auth = MutableStateFlow(DriveAuthState(isSignedIn = true, hasDriveScope = true))
        val invalidations = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 8)
        val scheduler = FakeSyncJobScheduler()
        val coordinatorScope = CoroutineScope(coroutineContext + SupervisorJob())
        val coordinator = SyncCoordinator(
            context = context,
            settingsFlow = settings,
            authFlow = auth,
            invalidationFlow = invalidations,
            scheduler = scheduler,
            scope = coordinatorScope
        )

        coordinator.start()
        advanceUntilIdle()
        settings.value = settings(syncEnabled = false, lastSyncedAt = null)
        advanceUntilIdle()

        assertEquals(1, scheduler.cancelPendingCount)
        assertEquals(1, scheduler.cancelPeriodicCount)
        coordinator.stop()
    }

    private fun settings(syncEnabled: Boolean, lastSyncedAt: Long?): SettingsState =
        SettingsState(
            weekStart = 1,
            use24h = false,
            accent = "Ember",
            autoBackupDaily = false,
            showCompletedToday = false,
            syncEnabled = syncEnabled,
            lastSyncedAt = lastSyncedAt
        )
}

private class FakeSyncJobScheduler : SyncJobScheduler {
    var startupCount = 0
    var periodicCount = 0
    var cancelPendingCount = 0
    var cancelPeriodicCount = 0
    val debouncedDelays = mutableListOf<Long>()

    override fun scheduleStartup(context: Context) {
        startupCount += 1
    }

    override fun scheduleDebounced(context: Context, delayMs: Long) {
        debouncedDelays += delayMs
    }

    override fun schedulePeriodic(context: Context) {
        periodicCount += 1
    }

    override fun cancelPending(context: Context) {
        cancelPendingCount += 1
    }

    override fun cancelPeriodic(context: Context) {
        cancelPeriodicCount += 1
    }
}
