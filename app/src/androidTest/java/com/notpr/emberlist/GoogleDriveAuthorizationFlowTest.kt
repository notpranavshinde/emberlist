package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.onboarding.OnboardingCompletionMethod
import com.notpr.emberlist.data.onboarding.OnboardingStatus
import com.notpr.emberlist.data.sync.SyncPayload
import com.notpr.emberlist.ui.screens.OnboardingRestoreState
import com.notpr.emberlist.ui.screens.OnboardingViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GoogleDriveAuthorizationFlowTest {
    @get:Rule
    val fakeDriveRule = FakeGoogleDriveRule()

    @Test
    fun continueWithGoogleAcceptsAuthorizedAccountWithoutGoogleId() = runBlocking {
        val container = fakeDriveRule.app.container
        val viewModel = OnboardingViewModel(
            context = fakeDriveRule.app,
            onboardingRepository = container.onboardingRepository,
            repository = container.repository,
            driveConnectAndSync = container.driveConnectAndSync,
            analytics = container.onboardingAnalytics
        )
        var authorizationResolutionRequested = false

        viewModel.beginRestore {
            authorizationResolutionRequested = true
        }
        val restoreState = withTimeout(45_000) {
            viewModel.restoreState.first { state ->
                state !is OnboardingRestoreState.Idle &&
                    state !is OnboardingRestoreState.Authorizing &&
                    state !is OnboardingRestoreState.Syncing
            }
        }

        val binding = container.settingsRepository.driveWorkspace.first()
        val restoredTask = container.repository.getTask(FakeGoogleDriveBackend.REMOTE_TASK_ID)
        val onboarding = container.onboardingRepository.state.first()

        assertEquals(OnboardingRestoreState.Success, restoreState)
        assertFalse(authorizationResolutionRequested)
        assertEquals(FakeGoogleDriveBackend.ACCOUNT_ID, binding.accountId)
        assertEquals(FakeGoogleDriveBackend.EMAIL, binding.email)
        assertNotNull(restoredTask)
        assertEquals(OnboardingStatus.COMPLETED, onboarding?.status)
        assertEquals(OnboardingCompletionMethod.DRIVE_RESTORE, onboarding?.completionMethod)
    }
}

class FakeGoogleDriveRule : ExternalResource() {
    val app: EmberlistApp
        get() = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp

    override fun before() {
        FakeGoogleDriveBackend.enabled = true
        FakeGoogleDriveBackend.remotePayload = SyncPayload(
            exportedAt = 1L,
            deviceId = "instrumentation-drive-device",
            payloadId = "instrumentation-drive-payload",
            tasks = listOf(
                TaskEntity(
                    id = FakeGoogleDriveBackend.REMOTE_TASK_ID,
                    title = "Restored from fake Google Drive",
                    description = "",
                    projectId = null,
                    sectionId = null,
                    priority = Priority.P4,
                    dueAt = null,
                    allDay = true,
                    deadlineAt = null,
                    deadlineAllDay = false,
                    recurringRule = null,
                    deadlineRecurringRule = null,
                    status = TaskStatus.OPEN,
                    completedAt = null,
                    parentTaskId = null,
                    locationId = null,
                    locationTriggerType = null,
                    order = 0,
                    createdAt = 1L,
                    updatedAt = 1L
                )
            )
        )
        runBlocking {
            app.container.settingsRepository.updateAnalyticsEnabled(false)
            app.container.settingsRepository.clearDriveWorkspaceBinding()
            app.container.settingsRepository.updateLastSyncedAt(null)
            app.container.database.clearAllTables()
            app.container.onboardingRepository.resetForSignedOutWorkspace()
            app.container.onboardingRepository.activate(now = 1L)
        }
    }

    override fun after() {
        runBlocking {
            app.container.settingsRepository.clearDriveWorkspaceBinding()
            app.container.database.clearAllTables()
            app.container.onboardingRepository.resetForSignedOutWorkspace()
        }
        FakeGoogleDriveBackend.reset()
    }
}
