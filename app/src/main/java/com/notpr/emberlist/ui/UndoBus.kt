package com.notpr.emberlist.ui

import kotlinx.coroutines.flow.MutableSharedFlow

data class UndoEvent(
    val message: String,
    val actionLabel: String = "Undo",
    val undo: suspend () -> Unit
)

object UndoBus {
    val events = MutableSharedFlow<UndoEvent>(extraBufferCapacity = 64)

    fun post(event: UndoEvent) {
        events.tryEmit(event)
    }
}
