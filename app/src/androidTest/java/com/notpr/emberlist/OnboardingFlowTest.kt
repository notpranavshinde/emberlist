package com.notpr.emberlist

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class OnboardingFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun resetWorkspaceAndOnboarding() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        runBlocking {
            app.container.database.clearAllTables()
            app.container.onboardingRepository.activate(now = 100L)
        }
    }

    @Test
    fun scheduledExamplePrefillsQuickAddAndClosingKeepsWelcomeActive() {
        composeRule.onNodeWithTag("onboarding-welcome").assertIsDisplayed()
        composeRule.onNodeWithTag("onboarding-example-scheduled").performClick()
        composeRule.onNodeWithTag("quick-add-input")
            .assertIsDisplayed()
            .assertTextContains("Call the dentist tomorrow 9am")

        composeRule.onNodeWithContentDescription("Close sheet").performClick()
        composeRule.onNodeWithTag("onboarding-welcome").assertIsDisplayed()
    }

    @Test
    fun skipRevealsNormalEmptyState() {
        composeRule.onNodeWithTag("onboarding-skip").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithTag("onboarding-welcome").fetchSemanticsNodes().isEmpty()
        }
    }
}
