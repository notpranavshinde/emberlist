package com.notpr.emberlist

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class UpcomingViewTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun upcomingTabRenders() {
        composeRule.onNodeWithText("Upcoming").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Upcoming").assertIsDisplayed()
    }
}
