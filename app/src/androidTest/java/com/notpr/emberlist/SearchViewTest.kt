package com.notpr.emberlist

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class SearchViewTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun searchTabRenders() {
        composeRule.onNodeWithText("Search").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Search").assertIsDisplayed()
    }
}
