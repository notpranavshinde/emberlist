package com.notpr.emberlist.data.sync

import androidx.room.InvalidationTracker
import com.notpr.emberlist.data.EmberlistDatabase
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

fun EmberlistDatabase.observeSyncInvalidations(): Flow<Unit> = callbackFlow {
    val observer = object : InvalidationTracker.Observer(
        "projects",
        "sections",
        "tasks",
        "reminders",
        "locations"
    ) {
        override fun onInvalidated(tables: Set<String>) {
            trySend(Unit).isSuccess
        }
    }
    invalidationTracker.addObserver(observer)
    awaitClose { invalidationTracker.removeObserver(observer) }
}
