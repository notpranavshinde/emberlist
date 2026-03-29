package com.notpr.emberlist.data

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.notpr.emberlist.data.backup.BackupManager
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.DriveSyncService
import com.notpr.emberlist.data.sync.GoogleDriveAppDataClient
import com.notpr.emberlist.data.sync.SyncManager
import com.notpr.emberlist.ui.UndoController

class AppContainer(context: Context) {
    private val appContext = context.applicationContext

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

    val reminderScheduler = ReminderScheduler(appContext, repository)
    val backupManager = BackupManager(database)
    val driveAuthManager = DriveAuthManager(appContext)
    val syncManager = SyncManager()
    val driveSyncService = DriveSyncService(
        context = appContext,
        payloadStore = backupManager,
        syncManager = syncManager,
        driveClientProvider = {
            driveAuthManager.getAuthorizedAccount()?.let { account ->
                GoogleDriveAppDataClient(appContext, account)
            }
        }
    )

    val undoController = UndoController()
}
