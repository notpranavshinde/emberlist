package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.reminders.ReminderScheduler
import com.notpr.emberlist.ui.UndoController
import com.notpr.emberlist.ui.screens.TodayViewModel
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
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class TodayViewModelManualOrderTest {
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
    fun reorderTodayTasksPersistsManualOrderForVisibleTodayParents() = runTest(dispatcher) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val repository = FakeTaskRepository()
        val scheduler = ReminderScheduler(context, repository)
        val viewModel = TodayViewModel(repository, UndoController(), scheduler)
        val zone = ZoneId.systemDefault()
        val dueAt = LocalDate.now(zone).atStartOfDay(zone).plusHours(9).toInstant().toEpochMilli()
        val now = System.currentTimeMillis()

        val alpha = task(id = "a", title = "Alpha", dueAt = dueAt, order = 0, now = now)
        val beta = task(id = "b", title = "Beta", dueAt = dueAt, order = 1, now = now)
        val gamma = task(id = "c", title = "Gamma", dueAt = dueAt, order = 2, now = now)
        repository.upsertTask(alpha)
        repository.upsertTask(beta)
        repository.upsertTask(gamma)

        viewModel.reorderTodayTasks(listOf("c", "a", "b"))
        advanceUntilIdle()

        assertEquals(0, repository.tasks.getValue("c").order)
        assertEquals(1, repository.tasks.getValue("a").order)
        assertEquals(2, repository.tasks.getValue("b").order)
    }

    private fun task(
        id: String,
        title: String,
        dueAt: Long,
        order: Int,
        now: Long
    ) = TaskEntity(
        id = id,
        title = title,
        description = "",
        projectId = null,
        sectionId = null,
        priority = Priority.P4,
        dueAt = dueAt,
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
        order = order,
        createdAt = now,
        updatedAt = now
    )
}
