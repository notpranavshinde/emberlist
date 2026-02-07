package com.notpr.emberlist.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

class SearchViewModel(private val repository: TaskRepository) : ViewModel() {
    private val query = MutableStateFlow("")

    val results: StateFlow<List<TaskEntity>> = query
        .flatMapLatest { repository.search(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun updateQuery(value: String) {
        query.value = value
    }
}
