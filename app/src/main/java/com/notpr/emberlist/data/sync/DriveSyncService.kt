package com.notpr.emberlist.data.sync

import android.content.Context
import kotlinx.serialization.SerializationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface SyncResult {
    data class Success(
        val payload: SyncPayload,
        val syncedAt: Long,
        val remoteCreated: Boolean
    ) : SyncResult

    data class Failure(val message: String, val cause: Throwable? = null) : SyncResult
}

class DriveSyncService(
    private val context: Context,
    private val payloadStore: SyncPayloadStore,
    private val syncManager: SyncManager,
    private val driveClientProvider: suspend () -> DriveAppDataClient?,
    private val statusTracker: SyncStatusTracker = SyncStatusTracker(),
    private val nowProvider: () -> Long = System::currentTimeMillis
) {
    private val mutex = Mutex()

    suspend fun sync(): SyncResult = mutex.withLock {
        val driveClient = driveClientProvider() ?: return SyncResult.Failure("Google Drive is not connected.")
        return runCatching {
            val localPayload = payloadStore.exportSyncPayload(context)
            val existingFile = driveClient.listSyncFiles(SYNC_FILE_NAME)
                .maxWithOrNull(compareBy<DriveFileRef> { it.modifiedTimeMs ?: Long.MIN_VALUE }.thenBy { it.id })
            val remotePayload = existingFile?.let { driveClient.downloadPayload(it.id) }
            remotePayload?.let { payload ->
                if (payload.schemaVersion > CURRENT_SYNC_SCHEMA_VERSION) {
                    return SyncResult.Failure("Remote sync data is from a newer app version.")
                }
            }

            if (remotePayload == null) {
                val latestLocalPayload = payloadStore.exportSyncPayload(context)
                driveClient.uploadPayload(SYNC_FILE_NAME, latestLocalPayload, existingFileId = null)
                SyncResult.Success(
                    payload = latestLocalPayload,
                    syncedAt = nowProvider(),
                    remoteCreated = true
                )
            } else {
                val merged = syncManager.merge(localPayload, remotePayload)
                statusTracker.setApplyingRemoteChanges(true)
                val latestMerged = try {
                    // Local edits can land while startup sync is downloading remote data.
                    // Re-read and merge inside the store import path so those edits are not overwritten.
                    payloadStore.mergeAndImportSyncPayload(
                        context = context,
                        incomingPayload = merged,
                        syncManager = syncManager,
                        replace = false
                    )
                } finally {
                    statusTracker.setApplyingRemoteChanges(false)
                }
                driveClient.uploadPayload(SYNC_FILE_NAME, latestMerged, existingFile.id)
                SyncResult.Success(
                    payload = latestMerged,
                    syncedAt = nowProvider(),
                    remoteCreated = false
                )
            }
        }.getOrElse { error ->
            SyncResult.Failure(
                message = error.toUserFacingSyncMessage(),
                cause = error
            )
        }
    }

    suspend fun resetRemoteSyncFile(): SyncResult = mutex.withLock {
        val driveClient = driveClientProvider() ?: return SyncResult.Failure("Google Drive is not connected.")
        return runCatching {
            val existingFiles = driveClient.listSyncFiles(SYNC_FILE_NAME)
            existingFiles.forEach { driveClient.deleteFile(it.id) }
            SyncResult.Success(
                payload = SyncPayload(
                    exportedAt = nowProvider(),
                    source = "android-reset"
                ),
                syncedAt = nowProvider(),
                remoteCreated = false
            )
        }.getOrElse { error ->
            SyncResult.Failure(
                message = error.message ?: "Failed to reset cloud sync file.",
                cause = error
            )
        }
    }

    companion object {
        const val SYNC_FILE_NAME = "emberlist_sync.json"
    }
}

private fun Throwable.toUserFacingSyncMessage(): String =
    when (this) {
        is SerializationException -> "Cloud sync file is invalid or corrupted. Local data was not changed. Use Reset cloud sync to recreate it."
        else -> message ?: "Sync failed."
    }
