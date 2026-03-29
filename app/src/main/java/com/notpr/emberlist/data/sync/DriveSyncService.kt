package com.notpr.emberlist.data.sync

import android.content.Context
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
                driveClient.uploadPayload(SYNC_FILE_NAME, localPayload, existingFileId = null)
                SyncResult.Success(
                    payload = localPayload,
                    syncedAt = nowProvider(),
                    remoteCreated = true
                )
            } else {
                val merged = syncManager.merge(localPayload, remotePayload)
                driveClient.uploadPayload(SYNC_FILE_NAME, merged, existingFile.id)
                payloadStore.importSyncPayload(merged, replace = false)
                SyncResult.Success(
                    payload = merged,
                    syncedAt = nowProvider(),
                    remoteCreated = false
                )
            }
        }.getOrElse { error ->
            SyncResult.Failure(
                message = error.message ?: "Sync failed.",
                cause = error
            )
        }
    }

    companion object {
        const val SYNC_FILE_NAME = "emberlist_sync.json"
    }
}
