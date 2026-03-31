package com.notpr.emberlist.data.sync

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch

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
    launch(Dispatchers.Main.immediate) {
        lifecycle.addObserver(observer)
    }
    awaitClose {
        launch(Dispatchers.Main.immediate) {
            lifecycle.removeObserver(observer)
        }
    }
}
