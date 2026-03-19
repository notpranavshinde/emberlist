package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.screens.TaskDetailViewModel
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class TaskDetailViewModelBulkSubtaskTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun addParsedSubtasksInheritsParentProjectAndSectionWhenLineHasNoOverrides() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val project = ProjectEntity(
            id = "project-1",
            name = "dailies",
            color = "#EE6A3C",
            favorite = false,
            order = 0,
            archived = false,
            viewPreference = null,
            createdAt = 0L,
            updatedAt = 0L
        )
        val section = SectionEntity(
            id = "section-1",
            projectId = project.id,
            name = "home",
            order = 0,
            createdAt = 0L,
            updatedAt = 0L
        )
        repository.upsertProject(project)
        repository.upsertSection(section)
        val parent = parentTask(project.id, section.id)
        repository.upsertTask(parent)

        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parser = QuickAddParser()

        viewModel.addParsedSubtasks(parent, listOf(parser.parse("buy milk"), parser.parse("call mom tomorrow 8am")))
        advanceUntilIdle()

        val subtasks = repository.getSubtasks(parent.id)
        assertEquals(2, subtasks.size)
        subtasks.forEach { subtask ->
            assertEquals(parent.id, subtask.parentTaskId)
            assertEquals(project.id, subtask.projectId)
            assertEquals(section.id, subtask.sectionId)
        }
        val timed = subtasks.first { it.title == "call mom" }
        assertNotNull(timed.dueAt)
        assertEquals(Priority.P4, subtasks.first { it.title == "buy milk" }.priority)
    }

    @Test
    fun addParsedSubtasksUsesPerLineProjectAndSectionOverrides() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val parentProject = ProjectEntity(
            id = "project-parent",
            name = "dailies",
            color = "#EE6A3C",
            favorite = false,
            order = 0,
            archived = false,
            viewPreference = null,
            createdAt = 0L,
            updatedAt = 0L
        )
        val parentSection = SectionEntity(
            id = "section-parent",
            projectId = parentProject.id,
            name = "home",
            order = 0,
            createdAt = 0L,
            updatedAt = 0L
        )
        repository.upsertProject(parentProject)
        repository.upsertSection(parentSection)
        val parent = parentTask(parentProject.id, parentSection.id)
        repository.upsertTask(parent)

        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parser = QuickAddParser()

        viewModel.addParsedSubtasks(parent, listOf(parser.parse("pay rent p1 #bills/monthly")))
        advanceUntilIdle()

        val subtask = repository.getSubtasks(parent.id).single()
        val billsProject = repository.getProjectByName("bills")
        val monthlySection = repository.getSectionByName(billsProject!!.id, "monthly")
        assertEquals(Priority.P1, subtask.priority)
        assertEquals(billsProject.id, subtask.projectId)
        assertEquals(monthlySection?.id, subtask.sectionId)
    }

    @Test
    fun addParsedSubtasksCreatesReminderRowsForTimedEntries() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val parent = parentTask()
        repository.upsertTask(parent)
        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parser = QuickAddParser()

        viewModel.addParsedSubtasks(parent, listOf(parser.parse("doctor appointment tomorrow 9am remind me 30m before")))
        advanceUntilIdle()

        val subtask = repository.getSubtasks(parent.id).single()
        val reminders = repository.getRemindersForTask(subtask.id)
        assertEquals(1, reminders.size)
        assertEquals(30, reminders.single().offsetMinutes)
    }

    @Test
    fun addParsedSubtasksKeepsSequentialSiblingOrder() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val parent = parentTask()
        repository.upsertTask(parent)
        repository.upsertTask(
            parent.copy(
                id = UUID.randomUUID().toString(),
                title = "existing child",
                parentTaskId = parent.id,
                order = 4
            )
        )
        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parser = QuickAddParser()

        viewModel.addParsedSubtasks(parent, listOf(parser.parse("one"), parser.parse("two")))
        advanceUntilIdle()

        val subtasks = repository.getSubtasks(parent.id).sortedBy { it.order }
        assertEquals(listOf(4, 5, 6), subtasks.map { it.order })
    }

    private fun parentTask(projectId: String? = null, sectionId: String? = null): TaskEntity {
        return TaskEntity(
            id = "parent-task",
            title = "Parent",
            description = "",
            projectId = projectId,
            sectionId = sectionId,
            priority = Priority.P3,
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
            updatedAt = 0L
        )
    }
}
