package com.notpr.emberlist.data.sync

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

fun observeAppForeground(): Flow<Boolean> = callbackFlow {
    val lifecycle = ProcessLifecycleOwner.get().lifecycle
    val observer = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) {
            trySend(true).isSuccess
        }

        override fun onStop(owner: LifecycleOwner) {
            trySend(false).isSuccess
        }
    }

    trySend(lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)).isSuccess
    lifecycle.addObserver(observer)
    awaitClose { lifecycle.removeObserver(observer) }
}
