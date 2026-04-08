package com.notpr.emberlist

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.pressBack
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class TaskDetailEditTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun openingAndClosingTaskDetailDoesNotMutateExistingSpacedProjectTask() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        val project = ProjectEntity(
            id = "project-to-buy-open-close-ui",
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
        val task = task(
            id = "task-open-close-ui",
            title = "pillows open close ${System.currentTimeMillis()}",
            projectId = project.id
        )
        runBlocking {
            app.container.repository.upsertProject(project)
            app.container.repository.upsertTask(task)
        }

        openTaskFromSearch(task.title)
        composeRule.onNodeWithText("${task.title} #to buy").assertIsDisplayed()
        pressBack()

        val persisted = runBlocking { app.container.database.taskDao().getTask(task.id) }!!
        assertEquals(task.title, persisted.title)
        assertEquals(project.id, persisted.projectId)
        assertEquals(null, persisted.sectionId)
    }

    @Test
    fun taskDetailCommitsExistingSpacedSectionOnBack() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        val project = ProjectEntity(
            id = "project-to-buy-task-detail-ui",
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
            id = "section-home-decor-task-detail-ui",
            projectId = project.id,
            name = "home decor",
            order = 0,
            createdAt = 0L,
            updatedAt = 0L,
            deletedAt = null
        )
        val task = task(
            id = "task-task-detail-ui",
            title = "pillows detail ${System.currentTimeMillis()}",
            projectId = project.id
        )
        runBlocking {
            app.container.repository.upsertProject(project)
            app.container.repository.upsertSection(section)
            app.container.repository.upsertTask(task)
        }

        openTaskFromSearch(task.title)
        composeRule.onNodeWithText("${task.title} #to buy").assertIsDisplayed()
        composeRule.onNodeWithText("${task.title} #to buy")
            .performTextReplacement("${task.title} #to buy/home d")
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("home decor").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("home decor").performClick()
        pressBack()

        val persisted = runBlocking { app.container.database.taskDao().getTask(task.id) }!!
        assertEquals(task.title, persisted.title)
        assertEquals(project.id, persisted.projectId)
        assertEquals(section.id, persisted.sectionId)
    }

    private fun openTaskFromSearch(title: String) {
        composeRule.onNodeWithText("Search").performClick()
        composeRule.onNodeWithContentDescription("Search").performClick()
        composeRule.onNodeWithText("Search").performTextInput(title)
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText(title).performClick()
    }

    private fun task(
        id: String,
        title: String,
        projectId: String? = null
    ) = TaskEntity(
        id = id,
        title = title,
        description = "",
        projectId = projectId,
        sectionId = null,
        priority = Priority.P4,
        dueAt = null,
        allDay = false,
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
        createdAt = 0L,
        updatedAt = 0L,
        deletedAt = null
    )
}
