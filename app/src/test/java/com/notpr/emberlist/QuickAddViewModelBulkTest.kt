package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.parsing.ReminderSpec
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.screens.quickadd.QuickAddViewModel
import java.time.LocalDate
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
}
