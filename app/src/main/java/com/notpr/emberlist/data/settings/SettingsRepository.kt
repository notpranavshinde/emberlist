package com.notpr.emberlist.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SettingsRepository(private val dataStore: DataStore<Preferences>) {
    companion object {
        val KEY_WEEK_START = intPreferencesKey("week_start")
        val KEY_24H = booleanPreferencesKey("use_24h")
        val KEY_ACCENT = stringPreferencesKey("accent")
        val KEY_AUTO_BACKUP = booleanPreferencesKey("auto_backup_daily")
        val KEY_SHOW_COMPLETED_TODAY = booleanPreferencesKey("show_completed_today")
        val KEY_LAST_SYNCED_AT = stringPreferencesKey("last_synced_at")
        val KEY_ANALYTICS_ENABLED = booleanPreferencesKey("analytics_enabled")
        val KEY_DRIVE_ACCOUNT_ID = stringPreferencesKey("drive_account_id")
        val KEY_DRIVE_ACCOUNT_EMAIL = stringPreferencesKey("drive_account_email")
        val KEY_DRIVE_ACCOUNT_NAME = stringPreferencesKey("drive_account_name")
        val KEY_DRIVE_INITIAL_SYNC = booleanPreferencesKey("drive_initial_sync_completed")
        val KEY_DRIVE_PENDING_CHANGES = booleanPreferencesKey("drive_pending_changes")
    }

    val settings: Flow<SettingsState> = dataStore.data.map { prefs ->
        SettingsState(
            weekStart = prefs[KEY_WEEK_START] ?: 1,
            use24h = prefs[KEY_24H] ?: false,
            accent = prefs[KEY_ACCENT] ?: "Ember",
            autoBackupDaily = prefs[KEY_AUTO_BACKUP] ?: false,
            showCompletedToday = prefs[KEY_SHOW_COMPLETED_TODAY] ?: false,
            syncEnabled = true,
            lastSyncedAt = prefs[KEY_LAST_SYNCED_AT]?.toLongOrNull(),
            analyticsEnabled = prefs[KEY_ANALYTICS_ENABLED] ?: true
        )
    }

    val driveWorkspace: Flow<DriveWorkspaceState> = dataStore.data.map { prefs ->
        DriveWorkspaceState(
            accountId = prefs[KEY_DRIVE_ACCOUNT_ID],
            email = prefs[KEY_DRIVE_ACCOUNT_EMAIL],
            displayName = prefs[KEY_DRIVE_ACCOUNT_NAME],
            initialSyncCompleted = prefs[KEY_DRIVE_INITIAL_SYNC] ?: false,
            hasPendingChanges = prefs[KEY_DRIVE_PENDING_CHANGES] ?: false
        )
    }

    suspend fun updateWeekStart(value: Int) {
        dataStore.edit { it[KEY_WEEK_START] = value }
    }

    suspend fun updateUse24h(value: Boolean) {
        dataStore.edit { it[KEY_24H] = value }
    }

    suspend fun updateAccent(value: String) {
        dataStore.edit { it[KEY_ACCENT] = value }
    }

    suspend fun updateAutoBackupDaily(value: Boolean) {
        dataStore.edit { it[KEY_AUTO_BACKUP] = value }
    }

    suspend fun updateShowCompletedToday(value: Boolean) {
        dataStore.edit { it[KEY_SHOW_COMPLETED_TODAY] = value }
    }

    suspend fun updateLastSyncedAt(value: Long?) {
        dataStore.edit {
            if (value == null) {
                it.remove(KEY_LAST_SYNCED_AT)
            } else {
                it[KEY_LAST_SYNCED_AT] = value.toString()
            }
        }
    }

    suspend fun updateAnalyticsEnabled(value: Boolean) {
        dataStore.edit { it[KEY_ANALYTICS_ENABLED] = value }
    }

    suspend fun bindDriveWorkspace(
        accountId: String,
        email: String?,
        displayName: String?
    ) {
        dataStore.edit { prefs ->
            prefs[KEY_DRIVE_ACCOUNT_ID] = accountId
            email?.let { prefs[KEY_DRIVE_ACCOUNT_EMAIL] = it } ?: prefs.remove(KEY_DRIVE_ACCOUNT_EMAIL)
            displayName?.let { prefs[KEY_DRIVE_ACCOUNT_NAME] = it } ?: prefs.remove(KEY_DRIVE_ACCOUNT_NAME)
            prefs[KEY_DRIVE_INITIAL_SYNC] = true
            prefs[KEY_DRIVE_PENDING_CHANGES] = false
        }
    }

    suspend fun updateDrivePendingChanges(value: Boolean) {
        dataStore.edit { it[KEY_DRIVE_PENDING_CHANGES] = value }
    }

    suspend fun clearDriveWorkspaceBinding() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_DRIVE_ACCOUNT_ID)
            prefs.remove(KEY_DRIVE_ACCOUNT_EMAIL)
            prefs.remove(KEY_DRIVE_ACCOUNT_NAME)
            prefs.remove(KEY_DRIVE_INITIAL_SYNC)
            prefs.remove(KEY_DRIVE_PENDING_CHANGES)
        }
    }
}

data class DriveWorkspaceState(
    val accountId: String?,
    val email: String?,
    val displayName: String?,
    val initialSyncCompleted: Boolean,
    val hasPendingChanges: Boolean
) {
    val isBound: Boolean get() = !accountId.isNullOrBlank() && initialSyncCompleted
}

data class SettingsState(
    val weekStart: Int,
    val use24h: Boolean,
    val accent: String,
    val autoBackupDaily: Boolean,
    val showCompletedToday: Boolean,
    val syncEnabled: Boolean,
    val lastSyncedAt: Long?,
    val analyticsEnabled: Boolean
)
