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
    }

    val settings: Flow<SettingsState> = dataStore.data.map { prefs ->
        SettingsState(
            weekStart = prefs[KEY_WEEK_START] ?: 1,
            use24h = prefs[KEY_24H] ?: false,
            accent = prefs[KEY_ACCENT] ?: "Ember",
            autoBackupDaily = prefs[KEY_AUTO_BACKUP] ?: false
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
}

data class SettingsState(
    val weekStart: Int,
    val use24h: Boolean,
    val accent: String,
    val autoBackupDaily: Boolean
)
