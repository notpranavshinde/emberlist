package com.notpr.emberlist.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.notpr.emberlist.data.AppContainer
import com.notpr.emberlist.ui.screens.BrowseViewModel
import com.notpr.emberlist.ui.screens.InboxViewModel
import com.notpr.emberlist.ui.screens.ProjectViewModel
import com.notpr.emberlist.ui.screens.SearchViewModel
import com.notpr.emberlist.ui.screens.SettingsViewModel
import com.notpr.emberlist.ui.screens.TaskDetailViewModel
import com.notpr.emberlist.ui.screens.TodayViewModel
import com.notpr.emberlist.ui.screens.UpcomingViewModel
import com.notpr.emberlist.ui.screens.quickadd.QuickAddViewModel

class EmberlistViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(InboxViewModel::class.java) -> InboxViewModel(container.repository)
            modelClass.isAssignableFrom(TodayViewModel::class.java) -> TodayViewModel(container.repository)
            modelClass.isAssignableFrom(UpcomingViewModel::class.java) -> UpcomingViewModel(container.repository)
            modelClass.isAssignableFrom(BrowseViewModel::class.java) -> BrowseViewModel(container.repository)
            modelClass.isAssignableFrom(ProjectViewModel::class.java) -> ProjectViewModel(container.repository)
            modelClass.isAssignableFrom(TaskDetailViewModel::class.java) ->
                TaskDetailViewModel(container.repository, container.reminderScheduler)
            modelClass.isAssignableFrom(SearchViewModel::class.java) -> SearchViewModel(container.repository)
            modelClass.isAssignableFrom(QuickAddViewModel::class.java) ->
                QuickAddViewModel(container.repository, container.reminderScheduler)
            modelClass.isAssignableFrom(SettingsViewModel::class.java) ->
                SettingsViewModel(container.settingsRepository, container.repository)
            else -> throw IllegalArgumentException("Unknown ViewModel ${modelClass.name}")
        } as T
    }
}
