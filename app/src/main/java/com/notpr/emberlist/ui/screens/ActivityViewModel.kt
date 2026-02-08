package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityEventEntity
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class ActivityViewModel(private val repository: TaskRepository) : ViewModel() {
    val events: StateFlow<List<ActivityEventEntity>> = repository.observeAllActivity()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
