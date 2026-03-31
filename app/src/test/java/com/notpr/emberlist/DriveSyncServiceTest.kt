package com.notpr.emberlist

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.Priority
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.ReminderType
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import com.notpr.emberlist.data.sync.DriveAppDataClient
import com.notpr.emberlist.data.sync.DriveFileRef
import com.notpr.emberlist.data.sync.DriveSyncService
import com.notpr.emberlist.data.sync.SyncManager
import com.notpr.emberlist.data.sync.SyncPayload
import com.notpr.emberlist.data.sync.SyncPayloadStore
import com.notpr.emberlist.data.sync.SyncResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DriveSyncServiceTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun uploadsLocalPayloadWhenRemoteFileDoesNotExist() = runBlocking {
        val local = payload(taskTitle = "Local")
        val store = FakeSyncPayloadStore(local)
        val drive = FakeDriveAppDataClient()
        val service = DriveSyncService(
            context = context,
            payloadStore = store,
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val result = service.sync()

        assertTrue(result is SyncResult.Success && result.remoteCreated)
        assertEquals(local, drive.lastUploadedPayload)
        assertEquals(0, store.importedPayloads.size)
    }

    @Test
    fun mergesExistingRemotePayloadAndImportsMergedResult() = runBlocking {
        val local = payload(taskTitle = "Local", updatedAt = 10L)
        val remote = payload(taskTitle = "Remote", updatedAt = 20L)
        val store = FakeSyncPayloadStore(local)
        val drive = FakeDriveAppDataClient(
            files = mutableListOf(DriveFileRef("file-1", modifiedTimeMs = 50L)),
            payloads = mutableMapOf("file-1" to remote)
        )
        val service = DriveSyncService(
            context = context,
            payloadStore = store,
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val result = service.sync()

        assertTrue(result is SyncResult.Success && !result.remoteCreated)
        assertEquals("Remote", drive.lastUploadedPayload?.tasks?.single()?.title)
        assertEquals(1, store.importedPayloads.size)
        assertEquals("Remote", store.importedPayloads.single().tasks.single().title)
    }

    @Test
    fun rejectsFutureSchemaVersions() = runBlocking {
        val local = payload(taskTitle = "Local")
        val remote = payload(taskTitle = "Remote").copy(schemaVersion = 999)
        val store = FakeSyncPayloadStore(local)
        val drive = FakeDriveAppDataClient(
            files = mutableListOf(DriveFileRef("file-1", modifiedTimeMs = 50L)),
            payloads = mutableMapOf("file-1" to remote)
        )
        val service = DriveSyncService(
            context = context,
            payloadStore = store,
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val result = service.sync()

        assertTrue(result is SyncResult.Failure)
        assertEquals(0, store.importedPayloads.size)
        assertEquals(null, drive.lastUploadedPayload)
    }

    @Test
    fun malformedRemotePayloadFailsSafelyWithoutUploadingOrImporting() = runBlocking {
        val store = FakeSyncPayloadStore(payload(taskTitle = "Local"))
        val drive = object : FakeDriveAppDataClient(
            files = mutableListOf(DriveFileRef("file-1", modifiedTimeMs = 50L))
        ) {
            override suspend fun downloadPayload(fileId: String): SyncPayload? {
                throw SerializationException("Bad remote JSON")
            }
        }
        val service = DriveSyncService(
            context = context,
            payloadStore = store,
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val result = service.sync()

        assertTrue(result is SyncResult.Failure)
        assertEquals(
            "Cloud sync file is invalid or corrupted. Local data was not changed. Use Reset cloud sync to recreate it.",
            (result as SyncResult.Failure).message
        )
        assertTrue(store.importedPayloads.isEmpty())
        assertNull(drive.lastUploadedPayload)
    }

    @Test
    fun overlappingSyncCallsDoNotOverlapExecution() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val drive = BlockingDriveAppDataClient(gate)
        val store = FakeSyncPayloadStore(payload(taskTitle = "Local"))
        val service = DriveSyncService(
            context = context,
            payloadStore = store,
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val first = async { service.sync() }
        val second = async { service.sync() }
        while (drive.listCalls == 0) {
            kotlinx.coroutines.yield()
        }
        assertEquals(1, drive.maxConcurrentCalls)
        gate.complete(Unit)
        awaitAll(first, second)

        assertEquals(2, drive.listCalls)
        assertEquals(1, drive.maxConcurrentCalls)
    }

    @Test
    fun resetRemoteSyncFileDeletesAllMatchingCloudFiles() = runBlocking {
        val drive = FakeDriveAppDataClient(
            files = mutableListOf(
                DriveFileRef("file-1", modifiedTimeMs = 10L),
                DriveFileRef("file-2", modifiedTimeMs = 20L)
            )
        )
        val service = DriveSyncService(
            context = context,
            payloadStore = FakeSyncPayloadStore(payload(taskTitle = "Local")),
            syncManager = SyncManager(nowProvider = { 100L }, payloadIdFactory = { "merged" }),
            driveClientProvider = { drive },
            nowProvider = { 100L }
        )

        val result = service.resetRemoteSyncFile()

        assertTrue(result is SyncResult.Success)
        assertEquals(listOf("file-1", "file-2"), drive.deletedFileIds)
    }

    private fun payload(
        taskTitle: String,
        updatedAt: Long = 1L
    ): SyncPayload {
        val project = ProjectEntity(
            id = "project-1",
            name = "Project",
            color = "#fff",
            favorite = false,
            order = 0,
            archived = false,
            viewPreference = null,
            createdAt = 1L,
            updatedAt = updatedAt
        )
        val section = SectionEntity(
            id = "section-1",
            projectId = project.id,
            name = "Section",
            order = 0,
            createdAt = 1L,
            updatedAt = updatedAt
        )
        val task = TaskEntity(
            id = "task-1",
            title = taskTitle,
            description = "",
            projectId = project.id,
            sectionId = section.id,
            priority = Priority.P4,
            dueAt = null,
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
            createdAt = 1L,
            updatedAt = updatedAt
        )
        val reminder = ReminderEntity(
            id = "reminder-1",
            taskId = task.id,
            type = ReminderType.TIME,
            timeAt = null,
            offsetMinutes = 15,
            locationId = null,
            locationTriggerType = null,
            enabled = true,
            ephemeral = false,
            createdAt = 1L,
            updatedAt = updatedAt
        )
        val location = LocationEntity(
            id = "location-1",
            label = "Location",
            address = "123 Test",
            lat = 1.0,
            lng = 2.0,
            radiusMeters = 100,
            createdAt = 1L,
            updatedAt = updatedAt
        )
        return SyncPayload(
            schemaVersion = 1,
            exportedAt = updatedAt,
            deviceId = "device-1",
            payloadId = "payload-1",
            source = "android",
            projects = listOf(project),
            sections = listOf(section),
            tasks = listOf(task),
            reminders = listOf(reminder),
            locations = listOf(location)
        )
    }
}

private class FakeSyncPayloadStore(
    private val exportPayload: SyncPayload
) : SyncPayloadStore {
    val importedPayloads = mutableListOf<SyncPayload>()

    override suspend fun exportSyncPayload(context: Context): SyncPayload = exportPayload

    override suspend fun importSyncPayload(payload: SyncPayload, replace: Boolean) {
        importedPayloads += payload
    }
}

private open class FakeDriveAppDataClient(
    private val files: MutableList<DriveFileRef> = mutableListOf(),
    private val payloads: MutableMap<String, SyncPayload> = mutableMapOf()
) : DriveAppDataClient {
    var lastUploadedPayload: SyncPayload? = null
    val deletedFileIds = mutableListOf<String>()

    override suspend fun listSyncFiles(name: String): List<DriveFileRef> = files.toList()

    override suspend fun downloadPayload(fileId: String): SyncPayload? = payloads[fileId]

    override suspend fun uploadPayload(name: String, payload: SyncPayload, existingFileId: String?): String {
        val fileId = existingFileId ?: "new-file"
        payloads[fileId] = payload
        if (files.none { it.id == fileId }) {
            files += DriveFileRef(fileId, modifiedTimeMs = 100L)
        }
        lastUploadedPayload = payload
        return fileId
    }

    override suspend fun deleteFile(fileId: String) {
        deletedFileIds += fileId
        files.removeAll { it.id == fileId }
        payloads.remove(fileId)
    }
}

private class BlockingDriveAppDataClient(
    private val gate: CompletableDeferred<Unit>
) : DriveAppDataClient {
    var listCalls = 0
    private var currentCalls = 0
    var maxConcurrentCalls = 0

    override suspend fun listSyncFiles(name: String): List<DriveFileRef> {
        currentCalls += 1
        maxConcurrentCalls = maxOf(maxConcurrentCalls, currentCalls)
        listCalls += 1
        gate.await()
        currentCalls -= 1
        return emptyList()
    }

    override suspend fun downloadPayload(fileId: String): SyncPayload? = null

    override suspend fun uploadPayload(name: String, payload: SyncPayload, existingFileId: String?): String = "new-file"

    override suspend fun deleteFile(fileId: String) = Unit
}
