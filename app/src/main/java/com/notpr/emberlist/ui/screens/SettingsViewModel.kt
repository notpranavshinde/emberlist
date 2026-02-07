package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.settings.SettingsRepository
import com.notpr.emberlist.data.settings.SettingsState
import com.notpr.emberlist.data.TaskRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val repository: TaskRepository
) : ViewModel() {
    val settings: StateFlow<SettingsState> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsState(1, false, "System", "Ember", 30))

    fun updateWeekStart(value: Int) {
        viewModelScope.launch { settingsRepository.updateWeekStart(value) }
    }

    fun updateUse24h(value: Boolean) {
        viewModelScope.launch { settingsRepository.updateUse24h(value) }
    }

    fun updateTheme(value: String) {
        viewModelScope.launch { settingsRepository.updateTheme(value) }
    }

    fun updateAccent(value: String) {
        viewModelScope.launch { settingsRepository.updateAccent(value) }
    }

    fun updateDefaultReminderOffset(value: Int) {
        viewModelScope.launch { settingsRepository.updateDefaultReminderOffset(value) }
    }

    fun clearCompleted() {
        viewModelScope.launch { repository.clearCompletedTasks() }
    }
}
