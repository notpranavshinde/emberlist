package com.notpr.emberlist.data.backup

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Serializable
data class BackupPayload(
    val projects: List<ProjectEntity>,
    val sections: List<SectionEntity>,
    val tasks: List<TaskEntity>,
    val reminders: List<ReminderEntity>,
    val locations: List<LocationEntity>,
    val activity: List<ActivityEventEntity>
)

class BackupManager(private val database: EmberlistDatabase) {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }

    suspend fun exportToUri(contentResolver: ContentResolver, uri: Uri) {
        val payload = BackupPayload(
            projects = database.projectDao().getAll(),
            sections = database.sectionDao().getAll(),
            tasks = database.taskDao().getAll(),
            reminders = database.reminderDao().getAll(),
            locations = database.locationDao().getAll(),
            activity = database.activityDao().getAll()
        )
        val output = json.encodeToString(payload)
        contentResolver.openOutputStream(uri)?.use { stream ->
            stream.write(output.toByteArray())
        }
    }

    suspend fun importFromUri(contentResolver: ContentResolver, uri: Uri, replace: Boolean) {
        val input = contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: return
        val payload = json.decodeFromString<BackupPayload>(input)
        database.runInTransaction {
            if (replace) {
                database.clearAllTables()
            }
        }
        payload.projects.forEach { database.projectDao().upsert(it) }
        payload.sections.forEach { database.sectionDao().upsert(it) }
        payload.tasks.forEach { database.taskDao().upsert(it) }
        payload.reminders.forEach { database.reminderDao().upsert(it) }
        payload.locations.forEach { database.locationDao().upsert(it) }
        payload.activity.forEach { database.activityDao().insert(it) }
    }

    suspend fun exportToFile(context: Context): File {
        val payload = BackupPayload(
            projects = database.projectDao().getAll(),
            sections = database.sectionDao().getAll(),
            tasks = database.taskDao().getAll(),
            reminders = database.reminderDao().getAll(),
            locations = database.locationDao().getAll(),
            activity = database.activityDao().getAll()
        )
        val output = json.encodeToString(payload)
        val dir = File(context.filesDir, "backup").apply { mkdirs() }
        val formatter = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
        val file = File(dir, "emberlist-backup-${formatter.format(Date())}.json")
        file.writeText(output)
        return file
    }

    suspend fun importFromFile(file: File, replace: Boolean) {
        if (!file.exists()) return
        val payload = json.decodeFromString<BackupPayload>(file.readText())
        database.runInTransaction {
            if (replace) {
                database.clearAllTables()
            }
        }
        payload.projects.forEach { database.projectDao().upsert(it) }
        payload.sections.forEach { database.sectionDao().upsert(it) }
        payload.tasks.forEach { database.taskDao().upsert(it) }
        payload.reminders.forEach { database.reminderDao().upsert(it) }
        payload.locations.forEach { database.locationDao().upsert(it) }
        payload.activity.forEach { database.activityDao().insert(it) }
    }
}
