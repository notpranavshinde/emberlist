package com.notpr.emberlist

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.backup.BackupManager
import com.notpr.emberlist.data.backup.BackupPayload
import com.notpr.emberlist.data.backup.LocalBackupRetention
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
import com.notpr.emberlist.data.sync.SyncPayload
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@RunWith(RobolectricTestRunner::class)
class BackupManagerTest {
    @get:Rule
    val temp = TemporaryFolder()

    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

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

    @Test
    fun syncPayloadDoesNotContainActivity() = kotlinx.coroutines.runBlocking {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        seedDatabase(db)
        val manager = BackupManager(db)
        val syncPayload = manager.exportSyncPayload(context)

        assertEquals(1, syncPayload.tasks.size)
        assertEquals(1, syncPayload.reminders.size)
        assertFalse(json.encodeToString(syncPayload).contains("activity"))

        db.close()
    }

    @Test
    fun importsLegacyFlatBackupPayload() = kotlinx.coroutines.runBlocking {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        val now = 1_700_000_000_000L
        val task = seededTask(now)
        val legacyPayload = """
            {
              "schemaVersion": 1,
              "exportedAt": $now,
              "deviceId": "legacy-device",
              "projects": [${json.encodeToString(seededProject(now))}],
              "sections": [${json.encodeToString(seededSection(now))}],
              "tasks": [${json.encodeToString(task)}],
              "reminders": [${json.encodeToString(seededReminder(now, task.id))}],
              "locations": [${json.encodeToString(seededLocation(now))}],
              "activity": [${json.encodeToString(seededActivity(now, task.id))}]
            }
        """.trimIndent()
        val file = File(temp.root, "legacy-backup.json").apply { writeText(legacyPayload) }

        BackupManager(db).importFromFile(file, replace = true)

        assertEquals(1, db.projectDao().getAll().size)
        assertEquals(1, db.sectionDao().getAll().size)
        assertEquals(1, db.taskDao().getAll().size)
        assertEquals(1, db.reminderDao().getAll().size)
        assertEquals(1, db.locationDao().getAll().size)
        assertEquals(1, db.activityDao().getAll().size)

        db.close()
    }

    @Test
    fun localBackupRetentionKeepsNewestBackups() {
        val directory = temp.newFolder("backups")
        val backups = (1..5).map { index ->
            File(directory, "emberlist-backup-$index.json").apply {
                writeText("backup $index")
                setLastModified(index.toLong())
            }
        }

        LocalBackupRetention.prune(directory, maxBackups = 3)

        assertFalse(backups[0].exists())
        assertFalse(backups[1].exists())
        assertTrue(backups[2].exists())
        assertTrue(backups[3].exists())
        assertTrue(backups[4].exists())
    }

    @Test
    fun localBackupRetentionIgnoresUnrelatedFiles() {
        val directory = temp.newFolder("mixed-backups")
        val oldestBackup = File(directory, "emberlist-backup-old.json").apply {
            writeText("old")
            setLastModified(1L)
        }
        File(directory, "emberlist-backup-new.json").apply {
            writeText("new")
            setLastModified(2L)
        }
        val exportedBackup = File(directory, "user-export.json").apply {
            writeText("portable export")
            setLastModified(0L)
        }

        LocalBackupRetention.prune(directory, maxBackups = 1)

        assertFalse(oldestBackup.exists())
        assertTrue(exportedBackup.exists())
    }

    private suspend fun seedDatabase(db: EmberlistDatabase) {
        val now = 1_700_000_000_000L
        val project = seededProject(now)
        val section = seededSection(now)
        val task = seededTask(now)
        val reminder = seededReminder(now, task.id)
        val location = seededLocation(now)
        val activity = seededActivity(now, task.id)

        db.projectDao().upsert(project)
        db.sectionDao().upsert(section)
        db.taskDao().upsert(task)
        db.reminderDao().upsert(reminder)
        db.locationDao().upsert(location)
        db.activityDao().insert(activity)
    }

    private fun seededProject(now: Long) = ProjectEntity(
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

    private fun seededSection(now: Long) = SectionEntity(
        id = "s1",
        projectId = "p1",
        name = "Chores",
        order = 0,
        createdAt = now,
        updatedAt = now
    )

    private fun seededTask(now: Long) = TaskEntity(
        id = "t1",
        title = "Wash dishes",
        description = "",
        projectId = "p1",
        sectionId = "s1",
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

    private fun seededReminder(now: Long, taskId: String) = ReminderEntity(
        id = "r1",
        taskId = taskId,
        type = ReminderType.TIME,
        timeAt = now + 60_000,
        offsetMinutes = null,
        locationId = null,
        locationTriggerType = null,
        enabled = true,
        ephemeral = false,
        createdAt = now
    )

    private fun seededLocation(now: Long) = LocationEntity(
        id = "l1",
        label = "Home",
        address = "123 Street",
        lat = 10.0,
        lng = 20.0,
        radiusMeters = 100,
        createdAt = now,
        updatedAt = now
    )

    private fun seededActivity(now: Long, taskId: String) = ActivityEventEntity(
        id = "a1",
        type = ActivityType.CREATED,
        objectType = ObjectType.TASK,
        objectId = taskId,
        payloadJson = "{}",
        createdAt = now
    )
}
