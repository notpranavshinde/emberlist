package com.notpr.emberlist.data.analytics

import com.notpr.emberlist.data.TaskRepository
import com.notpr.emberlist.data.model.ActivityType
import com.notpr.emberlist.data.model.ObjectType
import com.notpr.emberlist.domain.parseActivityChanges
import com.notpr.emberlist.domain.parseActivityPayload
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class ProductActivityAnalyticsBridge(
    private val repository: TaskRepository,
    private val analytics: OnboardingAnalytics
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun start() {
        scope.launch {
            var knownIds: Set<String>? = null
            repository.observeAllActivity().collectLatest { events ->
                val currentIds = events.mapTo(mutableSetOf()) { it.id }
                val previous = knownIds
                knownIds = currentIds
                if (previous == null) return@collectLatest
                events.filter { it.id !in previous }.sortedBy { it.createdAt }.forEach { event ->
                    when {
                        event.objectType == ObjectType.TASK && event.type == ActivityType.COMPLETED -> analytics.track("task_completed")
                        event.objectType == ObjectType.TASK && event.type == ActivityType.UNCOMPLETED -> analytics.track("task_reopened")
                        event.objectType == ObjectType.TASK && event.type == ActivityType.DELETED -> analytics.track("task_deleted", mapOf("countBucket" to "1"))
                        event.objectType == ObjectType.PROJECT && event.type == ActivityType.CREATED -> analytics.track("project_created")
                        event.objectType == ObjectType.SECTION && event.type == ActivityType.CREATED -> analytics.track("section_created")
                        event.type == ActivityType.REMINDER_SCHEDULED -> analytics.track("reminder_action", mapOf("action" to "schedule", "result" to "success"))
                    }
                    if (event.objectType == ObjectType.TASK && event.type == ActivityType.UPDATED) {
                        val payload = parseActivityPayload(event.payloadJson)
                        val changes = payload?.let(::parseActivityChanges).orEmpty()
                        if ("parent_task" in changes) {
                            if (payload?.containsKey("parentTaskIdAfter") == true) analytics.track("subtask_created")
                            else analytics.track("subtask_promoted")
                        }
                        if ("project" in changes || "section" in changes) {
                            analytics.track("task_moved", mapOf("origin" to "task"))
                        }
                        if (changes.any { it in setOf("priority", "due", "deadline", "recurrence", "deadline_recurrence", "reminders") }) {
                            analytics.track("organize_changed", mapOf("action" to "change", "countBucket" to "1"))
                        }
                    }
                }
            }
        }
    }
}
