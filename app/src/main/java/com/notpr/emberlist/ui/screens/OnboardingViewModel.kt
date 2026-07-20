package com.notpr.emberlist.ui.screens

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.analytics.OnboardingAnalytics
import com.notpr.emberlist.data.onboarding.OnboardingCompletionMethod
import com.notpr.emberlist.data.onboarding.OnboardingRepository
import com.notpr.emberlist.data.onboarding.OnboardingState
import com.notpr.emberlist.data.onboarding.OnboardingStatus
import com.notpr.emberlist.data.sync.DriveConnectAndSyncResult
import com.notpr.emberlist.data.sync.DriveConnectAndSyncUseCase
import com.notpr.emberlist.data.sync.SyncPayload
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface OnboardingRestoreState {
    data object Idle : OnboardingRestoreState
    data object Authorizing : OnboardingRestoreState
    data object Syncing : OnboardingRestoreState
    data object Empty : OnboardingRestoreState
    data object Success : OnboardingRestoreState
    data object Offline : OnboardingRestoreState
    data class Failure(val message: String) : OnboardingRestoreState
}

class OnboardingViewModel(
    private val context: Context,
    private val onboardingRepository: OnboardingRepository,
    private val repository: TaskRepository,
    private val driveConnectAndSync: DriveConnectAndSyncUseCase,
    private val analytics: OnboardingAnalytics
) : ViewModel() {
    val state: StateFlow<OnboardingState?> = onboardingRepository.state.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        null
    )
    private val _restoreState = kotlinx.coroutines.flow.MutableStateFlow<OnboardingRestoreState>(OnboardingRestoreState.Idle)
    val restoreState: StateFlow<OnboardingRestoreState> = _restoreState

    init {
        viewModelScope.launch {
            val hasContent = repository.observeWorkspaceTaskCount().first() > 0 ||
                repository.observeProjects().first().isNotEmpty() ||
                repository.observeAllSections().first().isNotEmpty()
            val initialized = onboardingRepository.initialize(hasContent)
            if (initialized.status == OnboardingStatus.ACTIVE && onboardingRepository.markViewedIfNeeded()) {
                analytics.track("onboarding_viewed")
            }
            if (initialized.status == OnboardingStatus.ACTIVE && initialized.restorePending && isOnline()) {
                _restoreState.value = OnboardingRestoreState.Syncing
                when (val resumed = driveConnectAndSync.start()) {
                    is DriveConnectAndSyncResult.AuthorizationRequired -> _restoreState.value = OnboardingRestoreState.Idle
                    else -> consumeRestoreResult(resumed)
                }
            }
        }
    }

    fun primaryClicked() {
        viewModelScope.launch { analytics.track("onboarding_primary_clicked") }
    }

    fun exampleClicked(kind: String) {
        viewModelScope.launch {
            analytics.track("onboarding_example_clicked", mapOf("exampleKind" to kind))
        }
    }

    fun taskSaved(count: Int) {
        if (count < 1 || state.value?.status != OnboardingStatus.ACTIVE) return
        viewModelScope.launch {
            val current = state.value ?: return@launch
            onboardingRepository.complete(OnboardingCompletionMethod.FIRST_TASK)
            analytics.track(
                "onboarding_completed",
                mapOf("method" to "first_task", "elapsedBucket" to elapsedBucket(current.startedAt))
            )
        }
    }

    fun dismiss() {
        viewModelScope.launch {
            onboardingRepository.dismiss()
            analytics.track("onboarding_skipped")
        }
    }

    fun activate() {
        viewModelScope.launch {
            onboardingRepository.activate()
            if (onboardingRepository.markViewedIfNeeded()) analytics.track("onboarding_viewed")
        }
    }

    fun beginRestore(onAuthorizationRequired: (Intent) -> Unit) {
        if (_restoreState.value == OnboardingRestoreState.Authorizing ||
            _restoreState.value == OnboardingRestoreState.Syncing) return
        viewModelScope.launch {
            analytics.track("onboarding_restore_started")
            if (!isOnline()) {
                onboardingRepository.setRestorePending(false)
                _restoreState.value = OnboardingRestoreState.Offline
                analytics.track("onboarding_restore_result", mapOf("result" to "offline"))
                return@launch
            }
            onboardingRepository.setRestorePending(true)
            _restoreState.value = OnboardingRestoreState.Syncing
            when (val result = driveConnectAndSync.start()) {
                is DriveConnectAndSyncResult.AuthorizationRequired -> {
                    _restoreState.value = OnboardingRestoreState.Authorizing
                    onAuthorizationRequired(result.intent)
                }
                else -> consumeRestoreResult(result)
            }
        }
    }

    fun handleAuthorizationResult(data: Intent?) {
        viewModelScope.launch {
            if (data == null) {
                onboardingRepository.setRestorePending(false)
                _restoreState.value = OnboardingRestoreState.Idle
                analytics.track("onboarding_restore_result", mapOf("result" to "cancelled"))
                return@launch
            }
            _restoreState.value = OnboardingRestoreState.Syncing
            consumeRestoreResult(driveConnectAndSync.connectResult(data))
        }
    }

    fun useAnotherAccount(onAuthorizationRequired: (Intent) -> Unit) {
        viewModelScope.launch {
            driveConnectAndSync.disconnect()
            _restoreState.value = OnboardingRestoreState.Idle
            beginRestore(onAuthorizationRequired)
        }
    }

    private suspend fun consumeRestoreResult(result: DriveConnectAndSyncResult) {
        when (result) {
            is DriveConnectAndSyncResult.AuthorizationRequired -> Unit
            DriveConnectAndSyncResult.Cancelled -> {
                onboardingRepository.setRestorePending(false)
                _restoreState.value = OnboardingRestoreState.Idle
                analytics.track("onboarding_restore_result", mapOf("result" to "cancelled"))
            }
            is DriveConnectAndSyncResult.Failure -> {
                onboardingRepository.setRestorePending(false)
                _restoreState.value = OnboardingRestoreState.Failure(result.message)
                analytics.track("onboarding_restore_result", mapOf("result" to "error"))
            }
            is DriveConnectAndSyncResult.Success -> {
                val nonEmpty = result.result.payload.hasLiveWorkspaceContent()
                onboardingRepository.setRestorePending(false)
                if (nonEmpty) {
                    val current = state.value
                    onboardingRepository.complete(OnboardingCompletionMethod.DRIVE_RESTORE)
                    _restoreState.value = OnboardingRestoreState.Success
                    analytics.track("onboarding_restore_result", mapOf("result" to "success"))
                    analytics.track(
                        "onboarding_completed",
                        mapOf("method" to "drive_restore", "elapsedBucket" to elapsedBucket(current?.startedAt))
                    )
                } else {
                    _restoreState.value = OnboardingRestoreState.Empty
                    analytics.track("onboarding_restore_result", mapOf("result" to "empty"))
                }
            }
        }
    }

    private fun isOnline(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun elapsedBucket(startedAt: Long?): String {
        val elapsed = System.currentTimeMillis() - (startedAt ?: System.currentTimeMillis())
        return when {
            elapsed < 30_000 -> "under_30s"
            elapsed < 60_000 -> "30_to_60s"
            elapsed < 300_000 -> "1_to_5m"
            else -> "over_5m"
        }
    }
}

private fun SyncPayload.hasLiveWorkspaceContent(): Boolean =
    tasks.any { it.deletedAt == null } ||
        projects.any { it.deletedAt == null } ||
        sections.any { it.deletedAt == null }
