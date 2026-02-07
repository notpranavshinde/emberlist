package com.notpr.emberlist

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class TodayViewTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun todayTabRenders() {
        composeRule.onNodeWithText("Today").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Today").assertIsDisplayed()
    }
}
