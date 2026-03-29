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
import com.notpr.emberlist.data.sync.CURRENT_SYNC_SCHEMA_VERSION
import com.notpr.emberlist.data.sync.SyncPayload
import com.notpr.emberlist.data.sync.SyncPayloadStore
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
    val sync: SyncPayload,
    val activity: List<ActivityEventEntity> = emptyList()
)

class BackupManager(private val database: EmberlistDatabase) : SyncPayloadStore {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }
    private companion object {
        const val PREFS_NAME = "emberlist_sync"
        const val KEY_DEVICE_ID = "device_id"
    }

    override suspend fun exportSyncPayload(context: Context): SyncPayload = buildSyncPayload(context)

    override suspend fun importSyncPayload(payload: SyncPayload, replace: Boolean) {
        applySyncPayload(payload, replace)
    }

    suspend fun exportToUri(context: Context, contentResolver: ContentResolver, uri: Uri) {
        val payload = buildBackupPayload(context)
        val output = json.encodeToString(payload)
        contentResolver.openOutputStream(uri)?.use { stream ->
            stream.write(output.toByteArray())
        }
    }

    suspend fun importFromUri(contentResolver: ContentResolver, uri: Uri, replace: Boolean) {
        val input = contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: return
        val payload = decodeBackupPayload(input)
        importPayload(payload, replace)
    }

    suspend fun exportToFile(context: Context): File {
        val payload = buildBackupPayload(context)
        val output = json.encodeToString(payload)
        val dir = File(context.filesDir, "backup").apply { mkdirs() }
        val formatter = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
        val file = File(dir, "emberlist-backup-${formatter.format(Date())}.json")
        file.writeText(output)
        return file
    }

    suspend fun importFromFile(file: File, replace: Boolean) {
        if (!file.exists()) return
        val payload = decodeBackupPayload(file.readText())
        importPayload(payload, replace)
    }

    private suspend fun buildBackupPayload(context: Context): BackupPayload {
        return BackupPayload(
            sync = buildSyncPayload(context),
            activity = database.activityDao().getAll()
        )
    }

    private suspend fun buildSyncPayload(context: Context): SyncPayload {
        return SyncPayload(
            schemaVersion = CURRENT_SYNC_SCHEMA_VERSION,
            exportedAt = System.currentTimeMillis(),
            deviceId = getOrCreateDeviceId(context),
            payloadId = java.util.UUID.randomUUID().toString(),
            source = "android",
            projects = database.projectDao().getAll(),
            sections = database.sectionDao().getAll(),
            tasks = database.taskDao().getAll(),
            reminders = database.reminderDao().getAll(),
            locations = database.locationDao().getAll()
        )
    }

    private suspend fun importPayload(payload: BackupPayload, replace: Boolean) {
        applySyncPayload(payload.sync, replace)
        payload.activity.forEach { database.activityDao().insert(it) }
    }

    private suspend fun applySyncPayload(payload: SyncPayload, replace: Boolean) {
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
    }

    private fun getOrCreateDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_DEVICE_ID, null) ?: java.util.UUID.randomUUID().toString().also { id ->
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
    }

    private fun decodeBackupPayload(input: String): BackupPayload {
        return runCatching { json.decodeFromString<BackupPayload>(input) }
            .recoverCatching { json.decodeFromString<LegacyBackupPayload>(input).toBackupPayload() }
            .getOrThrow()
    }
}

@Serializable
private data class LegacyBackupPayload(
    val schemaVersion: Int = CURRENT_SYNC_SCHEMA_VERSION,
    val exportedAt: Long = 0L,
    val deviceId: String = "",
    val projects: List<ProjectEntity> = emptyList(),
    val sections: List<SectionEntity> = emptyList(),
    val tasks: List<TaskEntity> = emptyList(),
    val reminders: List<ReminderEntity> = emptyList(),
    val locations: List<LocationEntity> = emptyList(),
    val activity: List<ActivityEventEntity> = emptyList()
) {
    fun toBackupPayload(): BackupPayload = BackupPayload(
        sync = SyncPayload(
            schemaVersion = schemaVersion,
            exportedAt = exportedAt,
            deviceId = deviceId,
            payloadId = "",
            source = "android-legacy-backup",
            projects = projects,
            sections = sections,
            tasks = tasks,
            reminders = reminders,
            locations = locations
        ),
        activity = activity
    )
}
