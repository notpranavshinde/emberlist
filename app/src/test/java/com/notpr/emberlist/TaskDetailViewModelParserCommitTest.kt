package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.screens.TaskDetailViewModel
import com.notpr.emberlist.ui.screens.resolveTaskDetailParsedResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class TaskDetailViewModelParserCommitTest {
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
    fun applyParsedTaskChangesReusesExistingSpacedProjectAndSection() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val project = project(id = "project-to-buy", name = "to buy")
        val section = section(id = "section-home-decor", projectId = project.id, name = "home decor")
        repository.upsertProject(project)
        repository.upsertSection(section)
        val current = task(id = "task-1")
        repository.upsertTask(current)

        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parsed = resolveTaskDetailParsedResult(
            parser = QuickAddParser(),
            input = "pillows #to buy/home decor",
            projects = repository.projects.values.toList(),
            sections = repository.sections.values.toList()
        )

        val updated = viewModel.applyParsedTaskChanges(
            current = current,
            description = "buy them this week",
            parsed = parsed,
            existingReminders = emptyList(),
            availableProjects = repository.projects.values.toList(),
            availableSections = repository.sections.values.toList()
        )
        advanceUntilIdle()

        assertEquals("pillows", updated.title)
        assertEquals("buy them this week", updated.description)
        assertEquals(project.id, updated.projectId)
        assertEquals(section.id, updated.sectionId)
        assertEquals(1, repository.projects.size)
        assertEquals(1, repository.sections.size)
    }

    @Test
    fun applyParsedTaskChangesDoesNotCreateMissingSpacedSection() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val project = project(id = "project-shopping", name = "shopping")
        repository.upsertProject(project)
        val current = task(id = "task-1", projectId = project.id)
        repository.upsertTask(current)

        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parsed = resolveTaskDetailParsedResult(
            parser = QuickAddParser(),
            input = "pillows #shopping/home decor",
            projects = repository.projects.values.toList(),
            sections = repository.sections.values.toList()
        )

        val updated = viewModel.applyParsedTaskChanges(
            current = current,
            description = "",
            parsed = parsed,
            existingReminders = emptyList(),
            availableProjects = repository.projects.values.toList(),
            availableSections = repository.sections.values.toList()
        )
        advanceUntilIdle()

        assertEquals("shopping", repository.projects[project.id]?.name)
        assertEquals(project.id, updated.projectId)
        assertEquals(1, repository.sections.size)
        val createdSection = repository.sections.values.single()
        assertEquals("home", createdSection.name)
        assertEquals(createdSection.id, updated.sectionId)
    }

    @Test
    fun applyParsedTaskChangesAddsDefaultReminderForBareTimedTask() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val current = task(id = "task-1", title = "old title")
        repository.upsertTask(current)
        val existingReminder = ReminderEntity(
            id = "old-reminder",
            taskId = current.id,
            type = ReminderType.TIME,
            timeAt = null,
            offsetMinutes = 30,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            ephemeral = false,
            createdAt = 0L
        )
        repository.upsertReminder(existingReminder)

        val viewModel = TaskDetailViewModel(repository, ReminderScheduler(context, repository), UndoController())
        val parsed = QuickAddParser().parse("pillows at 9:15pm")

        val updated = viewModel.applyParsedTaskChanges(
            current = current,
            description = "",
            parsed = parsed,
            existingReminders = listOf(existingReminder),
            availableProjects = emptyList(),
            availableSections = emptyList()
        )
        advanceUntilIdle()

        val reminders = repository.getRemindersForTask(updated.id)
        assertEquals("pillows", updated.title)
        assertEquals(1, reminders.size)
        assertEquals(updated.dueAt, reminders.single().timeAt)
        assertNull(reminders.single().offsetMinutes)
    }

    private fun task(
        id: String,
        title: String = "Current task",
        projectId: String? = null,
        sectionId: String? = null
    ) = TaskEntity(
        id = id,
        title = title,
        description = "",
        projectId = projectId,
        sectionId = sectionId,
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
        updatedAt = 0L
    )

    private fun project(id: String, name: String) = ProjectEntity(
        id = id,
        name = name,
        color = "#EE6A3C",
        favorite = false,
        order = 0,
        archived = false,
        viewPreference = null,
        createdAt = 0L,
        updatedAt = 0L,
        deletedAt = null
    )

    private fun section(id: String, projectId: String, name: String) = SectionEntity(
        id = id,
        projectId = projectId,
        name = name,
        order = 0,
        createdAt = 0L,
        updatedAt = 0L,
        deletedAt = null
    )
}
