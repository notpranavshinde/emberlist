package com.notpr.emberlist.data.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class SyncRuntimeStatus(
    val isSyncing: Boolean = false,
    val isApplyingRemoteChanges: Boolean = false,
    val hasPendingLocalChanges: Boolean = false,
    val isOnline: Boolean = true,
    val lastError: String? = null
)

class SyncStatusTracker {
    private val _state = MutableStateFlow(SyncRuntimeStatus())
    val state: StateFlow<SyncRuntimeStatus> = _state.asStateFlow()

    fun setSyncing(value: Boolean) {
        _state.value = _state.value.copy(isSyncing = value)
    }

    fun setApplyingRemoteChanges(value: Boolean) {
        _state.value = _state.value.copy(isApplyingRemoteChanges = value)
    }

    fun setOnline(value: Boolean) {
        _state.value = _state.value.copy(isOnline = value)
    }

    fun markPendingLocalChanges() {
        _state.value = _state.value.copy(hasPendingLocalChanges = true)
    }

    fun clearPendingLocalChanges() {
        _state.value = _state.value.copy(hasPendingLocalChanges = false)
    }

    fun setLastError(message: String?) {
        _state.value = _state.value.copy(lastError = message)
    }

    fun clearError() {
        _state.value = _state.value.copy(lastError = null)
    }

    fun onSyncSuccess() {
        _state.value = _state.value.copy(
            isSyncing = false,
            hasPendingLocalChanges = false,
            lastError = null
        )
    }

    fun onSyncFailure(message: String) {
        _state.value = _state.value.copy(
            isSyncing = false,
            lastError = message
        )
    }
}
