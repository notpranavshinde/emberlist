package com.notpr.emberlist

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class QuickAddFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun quickAddReusesExistingSpacedProjectAndSectionSuggestions() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        val title = "ui-quick-${System.currentTimeMillis()}"
        val project = ProjectEntity(
            id = "project-to-buy-ui",
            name = "to buy",
            color = "#EE6A3C",
            favorite = false,
            order = 0,
            archived = false,
            viewPreference = null,
            createdAt = 0L,
            updatedAt = 0L,
            deletedAt = null
        )
        val section = SectionEntity(
            id = "section-home-decor-ui",
            projectId = project.id,
            name = "home decor",
            order = 0,
            createdAt = 0L,
            updatedAt = 0L,
            deletedAt = null
        )
        runBlocking {
            app.container.repository.upsertProject(project)
            app.container.repository.upsertSection(section)
        }

        composeRule.onNodeWithContentDescription("Quick Add").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Task name").assertIsDisplayed().performTextInput("$title #to b")
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("to buy").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("to buy").performClick()
        composeRule.onNodeWithText("Task name").performTextInput("/home d")
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("home decor").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("home decor").performClick()
        composeRule.onNodeWithText("Add").performClick()

        composeRule.waitUntil(5_000) {
            runBlocking {
                app.container.database.taskDao().search(title).first().any { it.title == title }
            }
        }

        val task = runBlocking {
            app.container.database.taskDao().search(title).first().first { it.title == title }
        }
        assertEquals(project.id, task.projectId)
        assertEquals(section.id, task.sectionId)
        assertEquals(title, task.title)
    }
}
