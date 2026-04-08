package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.parsing.ReminderSpec
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.screens.quickadd.QuickAddViewModel
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
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
class QuickAddViewModelBulkTest {
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
    fun saveBulkTasksUsesPerLineParserAndFallsBackToSheetDefaults() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        val zone = ZoneId.systemDefault()
        val todayStart = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()

        viewModel.setDefaultDueToday(todayStart)
        viewModel.setPriorityOverride(Priority.P1)
        viewModel.setProjectOverride("dailies")
        viewModel.saveBulkTasks(
            listOf(
                "pay rent tomorrow p2 #bills",
                "laundry"
            )
        ) {}
        advanceUntilIdle()

        assertEquals(2, repository.tasks.size)
        val billsProject = repository.getProjectByName("bills")
        val dailiesProject = repository.getProjectByName("dailies")
        assertNotNull(billsProject)
        assertNotNull(dailiesProject)

        val rentTask = repository.tasks.values.first { it.title == "pay rent" }
        val laundryTask = repository.tasks.values.first { it.title == "laundry" }

        assertEquals(Priority.P2, rentTask.priority)
        assertEquals(billsProject?.id, rentTask.projectId)
        assertEquals(Priority.P1, laundryTask.priority)
        assertEquals(dailiesProject?.id, laundryTask.projectId)
        assertEquals(todayStart, laundryTask.dueAt)
    }

    @Test
    fun saveSingleTaskFromBulkJoinsLinesIntoOneTitle() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)

        viewModel.saveSingleTaskFromBulk(listOf("buy milk", "call mom", "file taxes")) {}
        advanceUntilIdle()

        assertEquals(1, repository.tasks.size)
        val task = repository.tasks.values.single()
        assertEquals("buy milk call mom file taxes", task.title)
    }

    @Test
    fun saveSingleTaskFromBulkAppliesSheetDefaults() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        val zone = ZoneId.systemDefault()
        val todayStart = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()

        viewModel.setDefaultDueToday(todayStart)
        viewModel.setPriorityOverride(Priority.P2)
        viewModel.setProjectOverride("work")
        viewModel.saveSingleTaskFromBulk(listOf("first item", "second item")) {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        val workProject = repository.getProjectByName("work")
        assertEquals("first item second item", task.title)
        assertEquals(Priority.P2, task.priority)
        assertEquals(todayStart, task.dueAt)
        assertEquals(workProject?.id, task.projectId)
    }

    @Test
    fun saveBulkTasksPreservesPerLineReminderAndRecurrence() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)

        viewModel.setRemindersOverride(listOf(ReminderSpec.Absolute(System.currentTimeMillis() + 3_600_000L)))
        viewModel.saveBulkTasks(
            listOf(
                "meditate tomorrow 8am remind me at tomorrow 7am",
                "laundry every day"
            )
        ) {}
        advanceUntilIdle()

        val laundry = repository.tasks.values.first { it.recurringRule == "FREQ=DAILY" }
        val meditate = repository.tasks.values.first { it.id != laundry.id }
        val meditateReminders = repository.getRemindersForTask(meditate.id)
        val laundryReminders = repository.getRemindersForTask(laundry.id)

        assertEquals("FREQ=DAILY", laundry.recurringRule)
        assertTrue(meditateReminders.size == 1)
        assertNotNull(meditateReminders.single().timeAt)
        assertEquals(1, laundryReminders.size)
        assertNotNull(laundryReminders.single().timeAt)
    }

    @Test
    fun bulkTaskLinesUsesSharedCleanupRules() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)

        viewModel.updateInput("- buy milk\n\n* call mom\n1. keep numbered")

        assertEquals(listOf("buy milk", "call mom", "1. keep numbered"), viewModel.bulkTaskLines())
    }

    @Test
    fun saveTaskCreatesTodayTimedTaskAndReminderForBareTime() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        val zone = ZoneId.systemDefault()

        viewModel.updateInput("tax forms at 9:50pm")
        viewModel.saveTask {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        val reminders = repository.getRemindersForTask(task.id)
        val due = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(task.dueAt!!), zone)

        assertEquals("tax forms", task.title)
        assertTrue(!task.allDay)
        assertEquals(21, due.hour)
        assertEquals(50, due.minute)
        assertEquals(LocalDate.now(zone), due.toLocalDate())
        assertEquals(1, reminders.size)
        assertEquals(task.dueAt, reminders.single().timeAt)
    }

    @Test
    fun saveBulkTasksCreatesTodayTimedTaskAndReminderForBareTimeLine() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        val zone = ZoneId.systemDefault()

        viewModel.saveBulkTasks(listOf("call mom at 7:15pm", "laundry")) {}
        advanceUntilIdle()

        val timedTask = repository.tasks.values.first { it.title == "call mom" }
        val timedReminder = repository.getRemindersForTask(timedTask.id).single()
        val due = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(timedTask.dueAt!!), zone)

        assertEquals(LocalDate.now(zone), due.toLocalDate())
        assertEquals(19, due.hour)
        assertEquals(15, due.minute)
        assertEquals(timedTask.dueAt, timedReminder.timeAt)
    }

    @Test
    fun saveTaskUsesExistingSpacedProjectWithoutLeakingProjectTextIntoTitle() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        repository.upsertProject(
            ProjectEntity(
                id = "project-to-buy",
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
        )
        advanceUntilIdle()

        viewModel.updateInput("pillows #to buy")
        viewModel.saveTask {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        assertEquals("pillows", task.title)
        assertEquals("project-to-buy", task.projectId)
    }

    @Test
    fun saveTaskUsesExistingSpacedProjectAndSectionWithoutLeakingParserText() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        val project = ProjectEntity(
            id = "project-to-buy",
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
            id = "section-home-decor",
            projectId = project.id,
            name = "home decor",
            order = 0,
            createdAt = 0L,
            updatedAt = 0L,
            deletedAt = null
        )
        repository.upsertProject(project)
        repository.upsertSection(section)
        advanceUntilIdle()

        viewModel.updateInput("pillows #to buy/home decor")
        viewModel.saveTask {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        assertEquals("pillows", task.title)
        assertEquals(project.id, task.projectId)
        assertEquals(section.id, task.sectionId)
        assertEquals(1, repository.projects.size)
        assertEquals(1, repository.sections.size)
    }

    @Test
    fun saveTaskDoesNotCreateNewSpacedProjectFromOverride() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)

        viewModel.setProjectOverride("to buy")
        viewModel.updateInput("pillows")
        viewModel.saveTask {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        assertEquals("pillows", task.title)
        assertNull(task.projectId)
        assertTrue(repository.projects.isEmpty())
    }

    @Test
    fun saveTaskDoesNotCreateNewSpacedSectionFromOverride() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = QuickAddViewModel(repository, scheduler)
        repository.upsertProject(
            ProjectEntity(
                id = "project-shopping",
                name = "shopping",
                color = "#EE6A3C",
                favorite = false,
                order = 0,
                archived = false,
                viewPreference = null,
                createdAt = 0L,
                updatedAt = 0L,
                deletedAt = null
            )
        )
        advanceUntilIdle()

        viewModel.setProjectOverride("shopping")
        viewModel.setSectionOverride("home decor")
        viewModel.updateInput("pillows")
        viewModel.saveTask {}
        advanceUntilIdle()

        val task = repository.tasks.values.single()
        assertEquals("pillows", task.title)
        assertEquals("project-shopping", task.projectId)
        assertNull(task.sectionId)
        assertTrue(repository.sections.isEmpty())
    }
}
