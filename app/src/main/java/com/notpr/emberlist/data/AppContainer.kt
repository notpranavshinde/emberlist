package com.notpr.emberlist.data

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.ui.UndoController

class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val database: EmberlistDatabase = EmberlistDatabase.build(appContext)

    val repository: TaskRepository = TaskRepositoryImpl(
        database.projectDao(),
        database.sectionDao(),
        database.taskDao(),
        database.reminderDao(),
        database.locationDao(),
        database.activityDao()
    )

    val settingsStore = PreferenceDataStoreFactory.create(
        produceFile = { appContext.preferencesDataStoreFile("settings.preferences_pb") }
    )

    val settingsRepository = SettingsRepository(settingsStore)

    val reminderScheduler = ReminderScheduler(appContext, repository)

    val geofenceScheduler = com.notpr.emberlist.location.GeofenceScheduler(appContext, repository)

    val undoController = UndoController()
}
