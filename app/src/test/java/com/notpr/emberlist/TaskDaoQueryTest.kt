package com.notpr.emberlist

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TaskDaoQueryTest {
    @Test
    fun inboxExcludesProjectAndSubtasks() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val dao = db.taskDao()
        val now = System.currentTimeMillis()
        val inboxTask = baseTask("inbox", null, null, now)
        val projectTask = baseTask("proj", "p1", null, now)
        val subtask = baseTask("sub", null, "inbox", now)
        dao.upsert(inboxTask)
        dao.upsert(projectTask)
        dao.upsert(subtask)

        val result = dao.observeInbox().first()
        assertEquals(listOf("inbox"), result.map { it.id })
        db.close()
    }

    @Test
    fun todayIncludesOverdue() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val dao = db.taskDao()
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
        val yesterday = LocalDate.now(zone).minusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val tomorrow = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        dao.upsert(baseTask("y", null, null, yesterday))
        dao.upsert(baseTask("t", null, null, today))
        dao.upsert(baseTask("n", null, null, tomorrow))

        val endOfDay = LocalDate.now(zone).atTime(java.time.LocalTime.MAX).atZone(zone).toInstant().toEpochMilli()
        val result = dao.observeToday(endOfDay = endOfDay).first().map { it.id }.sorted()
        assertEquals(listOf("t", "y"), result.sorted())
        db.close()
    }

    @Test
    fun upcomingExcludesToday() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val dao = db.taskDao()
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
        val tomorrow = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        dao.upsert(baseTask("t", null, null, today))
        dao.upsert(baseTask("n", null, null, tomorrow))

        val startOfTomorrow = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val result = dao.observeUpcoming(startOfTomorrow = startOfTomorrow).first().map { it.id }
        assertEquals(listOf("n"), result)
        db.close()
    }

    @Test
    fun subtasksQueriesExcludeCompleted() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val dao = db.taskDao()
        val now = System.currentTimeMillis()
        val parent = baseTask("p", null, null, now)
        val openSub = baseTask("s1", null, parent.id, now).copy(status = TaskStatus.OPEN)
        val doneSub = baseTask("s2", null, parent.id, now).copy(status = TaskStatus.COMPLETED)
        dao.upsert(parent)
        dao.upsert(openSub)
        dao.upsert(doneSub)

        val result = dao.observeSubtasks(parent.id).first()
        assertEquals(listOf("s1"), result.map { it.id })
        db.close()
    }

    private fun buildDb(): EmberlistDatabase {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        return Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    private fun baseTask(
        id: String,
        projectId: String?,
        parentId: String?,
        dueAt: Long?
    ): TaskEntity {
        return TaskEntity(
            id = id,
            title = "Task $id",
            description = "",
            projectId = projectId,
            sectionId = null,
            priority = Priority.P3,
            dueAt = dueAt,
            allDay = false,
            deadlineAt = null,
            deadlineAllDay = false,
            recurringRule = null,
            deadlineRecurringRule = null,
            status = TaskStatus.OPEN,
            completedAt = null,
            parentTaskId = parentId,
            locationId = null,
            locationTriggerType = null,
            order = 0,
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
    }
}
