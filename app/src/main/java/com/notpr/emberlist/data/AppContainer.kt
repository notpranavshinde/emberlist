package com.notpr.emberlist.data

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.notpr.emberlist.data.backup.BackupManager
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.analytics.OnboardingAnalytics
import com.notpr.emberlist.data.analytics.ProductActivityAnalyticsBridge
import com.notpr.emberlist.data.onboarding.OnboardingRepository
import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.DriveAppDataClient
import com.notpr.emberlist.data.sync.DriveSyncService
import com.notpr.emberlist.data.sync.DriveConnectAndSyncUseCase
import com.notpr.emberlist.data.sync.DriveAuthorizationResult
import com.notpr.emberlist.data.sync.GoogleDriveAppDataClient
import com.notpr.emberlist.data.sync.observeAppForeground
import com.notpr.emberlist.data.sync.observeNetworkConnectivity
import com.notpr.emberlist.data.sync.observeSyncInvalidations
import com.notpr.emberlist.data.sync.SyncCoordinator
import com.notpr.emberlist.data.sync.SyncManager
import com.notpr.emberlist.data.sync.SyncStatusTracker
import com.notpr.emberlist.ui.UndoController
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.Identity
import kotlinx.coroutines.flow.onEach

class AppContainer(
    context: Context,
    authorizationClient: AuthorizationClient = Identity.getAuthorizationClient(context),
    driveClientFactory: (String) -> DriveAppDataClient = ::GoogleDriveAppDataClient
) {
    val appContext: Context = context.applicationContext

    val database: EmberlistDatabase = EmberlistDatabase.getInstance(appContext)

    val repository: TaskRepository = TaskRepositoryImpl(
        database.projectDao(),
        database.sectionDao(),
        database.taskDao(),
        database.reminderDao(),
        database.activityDao()
    )

    val settingsStore = PreferenceDataStoreFactory.create(
        produceFile = { appContext.preferencesDataStoreFile("settings.preferences_pb") }
    )

    val settingsRepository = SettingsRepository(settingsStore)
    val onboardingRepository = OnboardingRepository(settingsStore)
    val onboardingAnalytics = OnboardingAnalytics(appContext, settingsStore, settingsRepository)
    val productActivityAnalyticsBridge = ProductActivityAnalyticsBridge(repository, onboardingAnalytics)

    val reminderScheduler = ReminderScheduler(appContext, repository)
    val backupManager = BackupManager(database)
    val driveAuthManager = DriveAuthManager(appContext, authorizationClient)
    val syncManager = SyncManager()
    val syncStatusTracker = SyncStatusTracker()
    val driveSyncService = DriveSyncService(
        context = appContext,
        payloadStore = backupManager,
        syncManager = syncManager,
        driveClientProvider = {
            when (val authorization = driveAuthManager.authorize()) {
                is DriveAuthorizationResult.Authorized ->
                    driveClientFactory(authorization.access.accessToken)
                else -> null
            }
        },
        statusTracker = syncStatusTracker
    )
    val driveConnectAndSync = DriveConnectAndSyncUseCase(
        authManager = driveAuthManager,
        syncService = driveSyncService,
        settingsRepository = settingsRepository,
        statusTracker = syncStatusTracker
    )
    val syncCoordinator = SyncCoordinator(
        context = appContext,
        settingsFlow = settingsRepository.settings,
        invalidationFlow = database.observeSyncInvalidations().onEach {
            settingsRepository.updateDrivePendingChanges(true)
        },
        foregroundFlow = observeAppForeground(),
        onlineFlow = observeNetworkConnectivity(appContext),
        statusTracker = syncStatusTracker
    )

    val undoController = UndoController()
}
