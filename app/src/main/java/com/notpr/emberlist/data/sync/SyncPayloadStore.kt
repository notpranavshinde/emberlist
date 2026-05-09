package com.notpr.emberlist.data.sync

import android.content.Context

interface SyncPayloadStore {
    suspend fun exportSyncPayload(context: Context): SyncPayload
    suspend fun importSyncPayload(payload: SyncPayload, replace: Boolean = false)

    suspend fun mergeAndImportSyncPayload(
        context: Context,
        incomingPayload: SyncPayload,
        syncManager: SyncManager,
        replace: Boolean = false
    ): SyncPayload {
        if (replace) {
            importSyncPayload(incomingPayload, replace = true)
            return incomingPayload
        }

        val latestLocalPayload = exportSyncPayload(context)
        val mergedPayload = syncManager.merge(latestLocalPayload, incomingPayload)
        importSyncPayload(mergedPayload, replace = false)
        return mergedPayload
    }
}
