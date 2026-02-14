package com.notpr.emberlist

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.backup.BackupManager
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BackupManagerTest {
    @get:Rule
    val temp = TemporaryFolder()

    @Test
    fun exportAndImportRoundTrip() = kotlinx.coroutines.runBlocking {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db1 = Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        val db2 = Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        seedDatabase(db1)
        val backupManager = BackupManager(db1)
        val file = File(temp.root, "backup.json")
        backupManager.exportToFile(context).copyTo(file, overwrite = true)

        val restore = BackupManager(db2)
        restore.importFromFile(file, replace = true)

        assertEquals(1, db2.projectDao().getAll().size)
        assertEquals(1, db2.sectionDao().getAll().size)
        assertEquals(1, db2.taskDao().getAll().size)
        assertEquals(1, db2.reminderDao().getAll().size)
        assertEquals(1, db2.locationDao().getAll().size)
        assertEquals(1, db2.activityDao().getAll().size)

        db1.close()
        db2.close()
    }

    private suspend fun seedDatabase(db: EmberlistDatabase) {
        val now = 1_700_000_000_000L
        val project = ProjectEntity(
            id = "p1",
            name = "Home",
            color = "#FF0000",
            favorite = false,
            order = 0,
            archived = false,
            viewPreference = null,
            createdAt = now,
            updatedAt = now
        )
        val section = SectionEntity(
            id = "s1",
            projectId = project.id,
            name = "Chores",
            order = 0,
            createdAt = now,
            updatedAt = now
        )
        val task = TaskEntity(
            id = "t1",
            title = "Wash dishes",
            description = "",
            projectId = project.id,
            sectionId = section.id,
            priority = Priority.P3,
            dueAt = now,
            allDay = false,
            deadlineAt = null,
            deadlineAllDay = false,
            recurringRule = null,
            deadlineRecurringRule = null,
            status = TaskStatus.OPEN,
            completedAt = null,
            parentTaskId = null,
            locationId = "l1",
            locationTriggerType = null,
            order = 0,
            createdAt = now,
            updatedAt = now
        )
        val reminder = ReminderEntity(
            id = "r1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = now + 60_000,
            offsetMinutes = null,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            createdAt = now
        )
        val location = LocationEntity(
            id = "l1",
            label = "Home",
            address = "123 Street",
            lat = 10.0,
            lng = 20.0,
            radiusMeters = 100,
            createdAt = now,
            updatedAt = now
        )
        val activity = ActivityEventEntity(
            id = "a1",
            type = ActivityType.CREATED,
            objectType = ObjectType.TASK,
            objectId = task.id,
            payloadJson = "{}",
            createdAt = now
        )

        db.projectDao().upsert(project)
        db.sectionDao().upsert(section)
        db.taskDao().upsert(task)
        db.reminderDao().upsert(reminder)
        db.locationDao().upsert(location)
        db.activityDao().insert(activity)
    }
}
