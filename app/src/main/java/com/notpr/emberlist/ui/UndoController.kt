package com.notpr.emberlist.ui

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

data class UndoEvent(
    val message: String,
    val actionLabel: String = "Undo",
    val undo: suspend () -> Unit
)

class UndoController {
    private val _events = MutableSharedFlow<UndoEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<UndoEvent> = _events

    fun post(event: UndoEvent) {
        _events.tryEmit(event)
    }
}
