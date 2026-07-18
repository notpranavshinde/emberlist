package com.notpr.emberlist

import android.Manifest
import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.rule.GrantPermissionRule
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

class TodayViewTest {
    private val notificationPermissionRule =
        GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    val composeRule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(notificationPermissionRule)
        .around(composeRule)

    @Test
    fun todayTabRenders() {
        composeRule.onNodeWithTag("today-screen-title").assertIsDisplayed()
    }

    @Test
    fun todaySubtaskExpanderShowsChildTask() {
        val app = ApplicationProvider.getApplicationContext<Context>() as EmberlistApp
        val suffix = System.currentTimeMillis().toString()
        val parent = task("today-parent-$suffix", "Parent $suffix", null)
        val child = task("today-child-$suffix", "Child $suffix", parent.id)
        runBlocking {
            app.container.repository.upsertTask(parent)
            app.container.repository.upsertTask(child)
        }

        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText(parent.title).fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue(composeRule.onAllNodesWithText(child.title).fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithTag("task-expand-${parent.id}").performClick()
        composeRule.onNodeWithText(child.title).assertIsDisplayed()
    }

    private fun task(id: String, title: String, parentTaskId: String?) = TaskEntity(
        id = id,
        title = title,
        description = "",
        projectId = null,
        sectionId = null,
        priority = Priority.P4,
        dueAt = System.currentTimeMillis(),
        allDay = false,
        deadlineAt = null,
        deadlineAllDay = false,
        recurringRule = null,
        deadlineRecurringRule = null,
        status = TaskStatus.OPEN,
        completedAt = null,
        parentTaskId = parentTaskId,
        locationId = null,
        locationTriggerType = null,
        order = 0,
        createdAt = System.currentTimeMillis(),
        updatedAt = System.currentTimeMillis(),
        deletedAt = null
    )
}
