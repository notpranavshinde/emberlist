package com.notpr.emberlist

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class QuickAddFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun quickAddSheetOpens() {
        composeRule.onNodeWithContentDescription("Quick Add").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Quick Add").assertIsDisplayed()
    }
}
