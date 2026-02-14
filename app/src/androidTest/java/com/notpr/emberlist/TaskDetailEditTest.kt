package com.notpr.emberlist

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.espresso.Espresso.pressBack
import org.junit.Rule
import org.junit.Test

class TaskDetailEditTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun canOpenTaskDetailFromToday() {
        composeRule.onNodeWithContentDescription("Quick Add").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Task name").assertIsDisplayed().performTextInput("Test task today")
        composeRule.onNodeWithText("Task name").performImeAction()
        pressBack()
        composeRule.onNodeWithText("Today").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Test task today").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Due").assertIsDisplayed()
    }
}
