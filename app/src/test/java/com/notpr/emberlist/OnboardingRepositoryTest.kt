package com.notpr.emberlist

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.notpr.emberlist.data.onboarding.OnboardingCompletionMethod
import com.notpr.emberlist.data.onboarding.OnboardingRepository
import com.notpr.emberlist.data.onboarding.OnboardingStatus
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class OnboardingRepositoryTest {
    private lateinit var file: File
    private lateinit var scope: TestScope
    private lateinit var repository: OnboardingRepository

    @Before
    fun setUp() {
        file = File.createTempFile("emberlist-onboarding", ".preferences_pb").apply { delete() }
        scope = TestScope(UnconfinedTestDispatcher())
        repository = OnboardingRepository(
            PreferenceDataStoreFactory.create(scope = scope, produceFile = { file })
        )
    }

    @After
    fun tearDown() {
        scope.cancel()
        file.delete()
    }

    @Test
    fun emptyInstallStartsActiveAndPersistsDismissal() = runBlocking {
        val active = repository.initialize(hasLiveContent = false, now = 100)
        assertEquals(OnboardingStatus.ACTIVE, active.status)
        assertEquals(100L, active.startedAt)

        repository.dismiss()
        val dismissed = repository.state.first()
        assertEquals(OnboardingStatus.DISMISSED, dismissed?.status)
        assertFalse(dismissed?.restorePending ?: true)
    }

    @Test
    fun existingWorkspaceInitializesCompleted() = runBlocking {
        val state = repository.initialize(hasLiveContent = true, now = 200)
        assertEquals(OnboardingStatus.COMPLETED, state.status)
        assertEquals(200L, state.completedAt)
        assertNull(state.completionMethod)
    }

    @Test
    fun firstTaskCompletionSurvivesLaterEmptyWorkspaceInitialization() = runBlocking {
        repository.initialize(hasLiveContent = false, now = 100)
        repository.complete(OnboardingCompletionMethod.FIRST_TASK, now = 150)

        val state = repository.initialize(hasLiveContent = false, now = 300)
        assertEquals(OnboardingStatus.COMPLETED, state.status)
        assertEquals(OnboardingCompletionMethod.FIRST_TASK, state.completionMethod)
        assertEquals(150L, state.completedAt)
    }

    @Test
    fun restorePendingAndViewMarkerAreDurable() = runBlocking {
        repository.initialize(hasLiveContent = false, now = 100)
        repository.setRestorePending(true)
        assertTrue(repository.state.first()?.restorePending == true)
        assertTrue(repository.markViewedIfNeeded())
        assertFalse(repository.markViewedIfNeeded())
    }
}
