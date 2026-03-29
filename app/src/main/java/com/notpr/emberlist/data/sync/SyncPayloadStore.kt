package com.notpr.emberlist.data.sync

import android.content.Context

interface SyncPayloadStore {
    suspend fun exportSyncPayload(context: Context): SyncPayload
    suspend fun importSyncPayload(payload: SyncPayload, replace: Boolean = false)
}
