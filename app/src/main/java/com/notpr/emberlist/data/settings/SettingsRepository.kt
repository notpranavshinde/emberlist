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
        val KEY_THEME = stringPreferencesKey("theme")
        val KEY_ACCENT = stringPreferencesKey("accent")
        val KEY_DEFAULT_REMINDER = intPreferencesKey("default_reminder_offset")
    }

    val settings: Flow<SettingsState> = dataStore.data.map { prefs ->
        SettingsState(
            weekStart = prefs[KEY_WEEK_START] ?: 1,
            use24h = prefs[KEY_24H] ?: false,
            theme = prefs[KEY_THEME] ?: "System",
            accent = prefs[KEY_ACCENT] ?: "Ember",
            defaultReminderOffset = prefs[KEY_DEFAULT_REMINDER] ?: 30
        )
    }

    suspend fun updateWeekStart(value: Int) {
        dataStore.edit { it[KEY_WEEK_START] = value }
    }

    suspend fun updateUse24h(value: Boolean) {
        dataStore.edit { it[KEY_24H] = value }
    }

    suspend fun updateTheme(value: String) {
        dataStore.edit { it[KEY_THEME] = value }
    }

    suspend fun updateAccent(value: String) {
        dataStore.edit { it[KEY_ACCENT] = value }
    }

    suspend fun updateDefaultReminderOffset(value: Int) {
        dataStore.edit { it[KEY_DEFAULT_REMINDER] = value }
    }
}

data class SettingsState(
    val weekStart: Int,
    val use24h: Boolean,
    val theme: String,
    val accent: String,
    val defaultReminderOffset: Int
)
