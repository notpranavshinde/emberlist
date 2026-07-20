package com.notpr.emberlist.data.onboarding

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

enum class OnboardingStatus { ACTIVE, COMPLETED, DISMISSED }
enum class OnboardingCompletionMethod { FIRST_TASK, DRIVE_RESTORE }

data class OnboardingState(
    val version: Int = 2,
    val status: OnboardingStatus,
    val startedAt: Long?,
    val completedAt: Long?,
    val completionMethod: OnboardingCompletionMethod?,
    val restorePending: Boolean
)

class OnboardingRepository(private val dataStore: DataStore<Preferences>) {
    companion object {
        private val KEY_VERSION = intPreferencesKey("onboarding_version")
        private val KEY_STATUS = stringPreferencesKey("onboarding_status")
        private val KEY_STARTED_AT = longPreferencesKey("onboarding_started_at")
        private val KEY_COMPLETED_AT = longPreferencesKey("onboarding_completed_at")
        private val KEY_COMPLETION_METHOD = stringPreferencesKey("onboarding_completion_method")
        private val KEY_RESTORE_PENDING = booleanPreferencesKey("onboarding_restore_pending")
        private val KEY_VIEW_RECORDED = booleanPreferencesKey("onboarding_view_recorded")
    }

    val state: Flow<OnboardingState?> = dataStore.data.map(::readState)

    suspend fun initialize(hasLiveContent: Boolean, now: Long = System.currentTimeMillis()): OnboardingState {
        val existing = state.first()
        if (existing != null) return existing
        val next = if (hasLiveContent) {
            OnboardingState(2, OnboardingStatus.COMPLETED, null, now, null, false)
        } else {
            OnboardingState(2, OnboardingStatus.ACTIVE, now, null, null, false)
        }
        write(next)
        return next
    }

    suspend fun activate(now: Long = System.currentTimeMillis()) {
        dataStore.edit { prefs ->
            writeTo(prefs, OnboardingState(2, OnboardingStatus.ACTIVE, now, null, null, false))
            prefs[KEY_VIEW_RECORDED] = false
        }
    }

    suspend fun dismiss() {
        update { it.copy(status = OnboardingStatus.DISMISSED, restorePending = false) }
    }

    suspend fun complete(method: OnboardingCompletionMethod, now: Long = System.currentTimeMillis()) {
        update {
            it.copy(
                status = OnboardingStatus.COMPLETED,
                completedAt = now,
                completionMethod = method,
                restorePending = false
            )
        }
    }

    suspend fun setRestorePending(pending: Boolean) {
        update { it.copy(restorePending = pending) }
    }

    suspend fun markViewedIfNeeded(): Boolean {
        var changed = false
        dataStore.edit { prefs ->
            if (prefs[KEY_VIEW_RECORDED] != true) {
                prefs[KEY_VIEW_RECORDED] = true
                changed = true
            }
        }
        return changed
    }

    private suspend fun update(transform: (OnboardingState) -> OnboardingState) {
        dataStore.edit { prefs ->
            val current = readState(prefs) ?: return@edit
            writeTo(prefs, transform(current))
        }
    }

    private suspend fun write(state: OnboardingState) {
        dataStore.edit { writeTo(it, state) }
    }

    private fun readState(prefs: Preferences): OnboardingState? {
        if (prefs[KEY_VERSION] != 2) return null
        val status = prefs[KEY_STATUS]?.let { runCatching { OnboardingStatus.valueOf(it) }.getOrNull() } ?: return null
        val method = prefs[KEY_COMPLETION_METHOD]?.let {
            runCatching { OnboardingCompletionMethod.valueOf(it) }.getOrNull()
        }
        return OnboardingState(
            version = 2,
            status = status,
            startedAt = prefs[KEY_STARTED_AT],
            completedAt = prefs[KEY_COMPLETED_AT],
            completionMethod = method,
            restorePending = prefs[KEY_RESTORE_PENDING] ?: false
        )
    }

    private fun writeTo(prefs: androidx.datastore.preferences.core.MutablePreferences, state: OnboardingState) {
        prefs[KEY_VERSION] = state.version
        prefs[KEY_STATUS] = state.status.name
        prefs[KEY_RESTORE_PENDING] = state.restorePending
        state.startedAt?.let { prefs[KEY_STARTED_AT] = it } ?: prefs.remove(KEY_STARTED_AT)
        state.completedAt?.let { prefs[KEY_COMPLETED_AT] = it } ?: prefs.remove(KEY_COMPLETED_AT)
        state.completionMethod?.let { prefs[KEY_COMPLETION_METHOD] = it.name } ?: prefs.remove(KEY_COMPLETION_METHOD)
    }
}
