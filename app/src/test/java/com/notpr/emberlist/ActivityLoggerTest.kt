package com.notpr.emberlist

import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.domain.CHANGE_DUE
import com.notpr.emberlist.domain.CHANGE_PRIORITY
import com.notpr.emberlist.domain.CHANGE_REMINDERS
import com.notpr.emberlist.domain.applyExactTaskUndo
import com.notpr.emberlist.domain.buildTaskActivityPayload
import com.notpr.emberlist.domain.formatActivityLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActivityLoggerTest {
    @Test
    fun updateLabelUsesSpecificCombinedSummary() {
        val before = testTask()
        val after = before.copy(
            priority = Priority.P1,
            dueAt = 2000L,
            updatedAt = 3000L
        )
        val event = ActivityEventEntity(
            id = "event",
            type = ActivityType.UPDATED,
            objectType = ObjectType.TASK,
            objectId = after.id,
            payloadJson = buildTaskActivityPayload(
                type = ActivityType.UPDATED,
                task = after,
                beforeTask = before
            ).toString(),
            createdAt = 0L
        )

        val label = formatActivityLabel(event)
        assertTrue(label.contains("changed due date", ignoreCase = true))
        assertTrue(label.contains("changed priority", ignoreCase = true))
        assertTrue(label.endsWith("for: test"))
    }

    @Test
    fun updateLabelUsesReminderSpecificText() {
        val before = testTask()
        val after = before.copy(updatedAt = 3000L)
        val event = ActivityEventEntity(
            id = "event",
            type = ActivityType.UPDATED,
            objectType = ObjectType.TASK,
            objectId = after.id,
            payloadJson = buildTaskActivityPayload(
                type = ActivityType.UPDATED,
                task = after,
                beforeTask = before,
                beforeReminders = emptyList(),
                afterReminders = listOf(
                    ReminderEntity(
                        id = "r1",
                        taskId = after.id,
                        type = ReminderType.TIME,
                        timeAt = 5000L,
                        offsetMinutes = null,
                        locationId = null,
                        locationTriggerType = null,
                        enabled = true,
                        ephemeral = false,
                        createdAt = 0L
                    )
                ),
                details = mapOf("reminderCountAfter" to "1")
            ).toString(),
            createdAt = 0L
        )

        assertEquals("Changed reminder for: test", formatActivityLabel(event))
    }

    @Test
    fun exactUndoRevertsOnlyChangedFields() {
        val before = testTask(priority = Priority.P4, dueAt = 1000L)
        val current = before.copy(
            priority = Priority.P1,
            dueAt = 2000L,
            description = "new notes",
            updatedAt = 9999L
        )

        val restored = applyExactTaskUndo(current, before, setOf(CHANGE_DUE, CHANGE_PRIORITY))

        assertEquals(1000L, restored.dueAt)
        assertEquals(Priority.P4, restored.priority)
        assertEquals("new notes", restored.description)
    }

    @Test
    fun reminderOnlyChangeStillProducesReminderChangeType() {
        val before = testTask()
        val after = before.copy(updatedAt = 4000L)
        val payload = buildTaskActivityPayload(
            type = ActivityType.UPDATED,
            task = after,
            beforeTask = before,
            beforeReminders = emptyList(),
            afterReminders = listOf(
                ReminderEntity(
                    id = "r1",
                    taskId = after.id,
                    type = ReminderType.TIME,
                    timeAt = 5000L,
                    offsetMinutes = null,
                    locationId = null,
                    locationTriggerType = null,
                    enabled = true,
                    ephemeral = false,
                    createdAt = 0L
                )
            )
        )

        assertEquals("[\"reminders\"]", payload["changes"].toString())
        assertEquals("Changed reminders for: test", payload["summary"]?.toString()?.trim('"'))
        assertEquals(CHANGE_REMINDERS, payload["changes"]!!.toString().trim('[', ']', '"'))
    }

    private fun testTask(
        priority: Priority = Priority.P4,
        dueAt: Long? = 1000L
    ) = TaskEntity(
        id = "task",
        title = "test",
        description = "",
        projectId = null,
        sectionId = null,
        priority = priority,
        dueAt = dueAt,
        allDay = true,
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
