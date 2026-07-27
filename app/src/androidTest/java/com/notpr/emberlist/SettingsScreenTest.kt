package com.notpr.emberlist

import android.content.Context
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.ui.screens.SettingsScreen
import com.notpr.emberlist.ui.theme.EmberlistTheme
import org.junit.Rule
import org.junit.Test

class SettingsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun settingsShowsOnlyCloudSyncAndPreferences() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        composeRule.setContent {
            EmberlistTheme {
                CompositionLocalProvider(LocalAppContainer provides app.container) {
                    SettingsScreen(padding = PaddingValues())
                }
            }
        }

        composeRule.onNodeWithText("Settings").assertIsDisplayed()
        composeRule.onNodeWithText("Cloud sync").assertIsDisplayed()
        composeRule.onNodeWithText("Preferences").assertIsDisplayed()
        composeRule.onNodeWithText("Anonymous analytics").assertIsDisplayed()
        composeRule.onNodeWithText("Show completed in Today").assertIsDisplayed()
        composeRule.onNodeWithText("Use 24-hour time").assertIsDisplayed()
        composeRule.onNodeWithText("Week starts on").assertIsDisplayed()

        composeRule.onAllNodesWithText("Getting started").assertCountEquals(0)
        composeRule.onAllNodesWithText("Daily local backup (keeps 7)").assertCountEquals(0)
        composeRule.onAllNodesWithText("Reset anonymous analytics ID").assertCountEquals(0)
        composeRule.onAllNodesWithText("Backup now").assertCountEquals(0)
        composeRule.onAllNodesWithText("Restore backup").assertCountEquals(0)
        composeRule.onAllNodesWithText("Export").assertCountEquals(0)
        composeRule.onAllNodesWithText("Import").assertCountEquals(0)

        composeRule.onAllNodes(isToggleable()).assertCountEquals(3)
        composeRule.onAllNodes(isToggleable()).onFirst().performClick()
        composeRule.onAllNodes(isToggleable()).onFirst().performClick()

        composeRule.onNode(hasText("Monday") and hasClickAction()).performClick()
        composeRule.onAllNodesWithText("Sunday").assertCountEquals(1)
        composeRule.onNodeWithText("Sunday").performClick()
        composeRule.onNode(hasText("Sunday") and hasClickAction()).assertIsDisplayed()
        composeRule.onNode(hasText("Sunday") and hasClickAction()).performClick()
        composeRule.onNodeWithText("Monday").performClick()
        composeRule.onNode(hasText("Monday") and hasClickAction()).assertIsDisplayed()
    }
}
