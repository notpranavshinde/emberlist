package com.notpr.emberlist.data.analytics

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.notpr.emberlist.BuildConfig
import com.notpr.emberlist.EmberlistApp
import com.notpr.emberlist.data.settings.SettingsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID

@Serializable
data class QueuedAnalyticsEvent(val createdAt: Long, val payload: AnalyticsPayload)

@Serializable
data class AnalyticsPayload(
    val schemaVersion: Int = 2,
    val eventId: String,
    val installId: String,
    val occurredAt: String,
    val event: String,
    val platform: String = "android",
    val appVersion: String,
    val properties: JsonObject = JsonObject(emptyMap())
)

class OnboardingAnalytics(
    private val context: Context,
    private val dataStore: DataStore<Preferences>,
    private val settingsRepository: SettingsRepository,
    private val workScheduler: (() -> Unit)? = null
) {
    companion object {
        private val KEY_QUEUE = stringPreferencesKey("product_analytics_queue_v2")
        private val KEY_LEGACY_QUEUE = stringPreferencesKey("onboarding_analytics_queue")
        private val KEY_INSTALL_ID = stringPreferencesKey("product_analytics_install_id_v2")
        private val KEY_LAST_SESSION = longPreferencesKey("product_analytics_last_session_v2")
        private const val MAX_QUEUE = 20
        private const val EVENT_TTL_MS = 7L * 24 * 60 * 60 * 1_000
        private const val SESSION_TTL_MS = 30L * 60 * 1_000
        private const val ENDPOINT = "https://emberlist.dev/api/analytics/events"
        private val json = Json { ignoreUnknownKeys = false }
        private val allowedEvents = setOf(
            "onboarding_viewed", "onboarding_primary_clicked", "onboarding_example_clicked",
            "onboarding_skipped", "onboarding_restore_started", "onboarding_restore_result", "onboarding_completed",
            "app_opened", "screen_viewed", "quick_add_opened", "task_create_result", "task_completed",
            "task_reopened", "task_deleted", "undo_used", "project_created", "section_created",
            "subtask_created", "subtask_promoted", "task_moved", "organize_changed", "search_used",
            "sync_action", "backup_action", "reminder_action", "operation_error"
        )
        private val allowedProperties = mapOf(
            "method" to setOf("first_task", "drive_restore"),
            "result" to setOf("success", "failure", "error", "empty", "cancelled", "offline", "denied", "permanently_denied", "unavailable"),
            "exampleKind" to setOf("simple", "scheduled", "recurring"),
            "elapsedBucket" to setOf("under_30s", "30_to_60s", "1_to_5m", "over_5m"),
            "countBucket" to setOf("1", "2_to_5", "6_plus"),
            "resultCountBucket" to setOf("0", "1", "2_to_5", "6_plus"),
            "origin" to setOf("fab", "keyboard", "today", "onboarding", "settings", "task", "project", "system", "unknown"),
            "action" to setOf("open", "create", "complete", "reopen", "delete", "move", "change", "sync", "restore", "connect", "disconnect", "export", "import", "schedule", "request_permission", "save", "undo"),
            "route" to setOf("today", "upcoming", "inbox", "project", "search", "calendar", "settings", "completed", "archived", "unknown"),
            "errorCategory" to setOf("validation", "network", "offline", "auth", "permission", "storage", "conflict", "schema", "configuration", "unknown"),
            "permission" to setOf("not_required", "granted", "denied", "permanently_denied")
        )
        private val booleanProperties = setOf("scheduled", "recurring", "reminder", "priority", "subtask", "bulk")
    }

    suspend fun track(
        event: String,
        properties: Map<String, String> = emptyMap(),
        booleans: Map<String, Boolean> = emptyMap()
    ) {
        if (event !in allowedEvents || properties.any { (key, value) -> value !in allowedProperties[key].orEmpty() } || booleans.keys.any { it !in booleanProperties }) return
        if (!settingsRepository.settings.first().analyticsEnabled) return
        val now = System.currentTimeMillis()
        dataStore.edit { prefs ->
            prefs.remove(KEY_LEGACY_QUEUE)
            val installId = prefs[KEY_INSTALL_ID]?.takeIf(::isUuid) ?: UUID.randomUUID().toString().also { prefs[KEY_INSTALL_ID] = it }
            val queue = decodeQueue(prefs[KEY_QUEUE]).filter { now >= it.createdAt && now - it.createdAt <= EVENT_TTL_MS }.toMutableList()
            val jsonProperties = properties.mapValues { JsonPrimitive(it.value) }.toMutableMap()
            booleans.forEach { (key, value) -> jsonProperties[key] = JsonPrimitive(value) }
            queue += QueuedAnalyticsEvent(
                createdAt = now,
                payload = AnalyticsPayload(
                    eventId = UUID.randomUUID().toString(), installId = installId,
                    occurredAt = Instant.ofEpochMilli(now).toString(), event = event,
                    appVersion = BuildConfig.VERSION_NAME, properties = JsonObject(jsonProperties)
                )
            )
            prefs[KEY_QUEUE] = json.encodeToString(queue.takeLast(MAX_QUEUE))
        }
        scheduleFlush()
    }

    suspend fun trackAppOpened(now: Long = System.currentTimeMillis()) {
        if (!settingsRepository.settings.first().analyticsEnabled) return
        val last = dataStore.data.first()[KEY_LAST_SESSION] ?: 0L
        if (last > 0L && now - last < SESSION_TTL_MS) return
        dataStore.edit { it[KEY_LAST_SESSION] = now }
        track("app_opened")
    }

    suspend fun clearQueueAndId() {
        dataStore.edit { prefs -> prefs.remove(KEY_QUEUE); prefs.remove(KEY_LEGACY_QUEUE); prefs.remove(KEY_INSTALL_ID); prefs.remove(KEY_LAST_SESSION) }
    }

    suspend fun clearQueue() { dataStore.edit { it.remove(KEY_QUEUE); it.remove(KEY_LEGACY_QUEUE) } }
    suspend fun resetInstallId() { clearQueueAndId() }

    suspend fun flush(): Boolean = withContext(Dispatchers.IO) {
        if (!settingsRepository.settings.first().analyticsEnabled) { clearQueueAndId(); return@withContext true }
        val now = System.currentTimeMillis()
        val queue = decodeQueue(dataStore.data.first()[KEY_QUEUE]).filter { now >= it.createdAt && now - it.createdAt <= EVENT_TTL_MS }.toMutableList()
        while (queue.isNotEmpty()) {
            if (!send(queue.first().payload)) return@withContext false
            queue.removeAt(0)
            dataStore.edit { prefs -> if (queue.isEmpty()) prefs.remove(KEY_QUEUE) else prefs[KEY_QUEUE] = json.encodeToString(queue) }
        }
        true
    }

    private fun scheduleFlush() {
        if (workScheduler != null) {
            workScheduler.invoke()
            return
        }
        val request = OneTimeWorkRequestBuilder<OnboardingAnalyticsWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniqueWork("product-analytics", ExistingWorkPolicy.KEEP, request)
    }

    private fun send(payload: AnalyticsPayload): Boolean {
        val connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 5_000; readTimeout = 5_000; doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        return runCatching {
            connection.outputStream.use { it.write(json.encodeToString(payload).toByteArray()) }
            connection.responseCode in 200..299
        }.getOrDefault(false).also { connection.disconnect() }
    }

    private fun decodeQueue(value: String?): List<QueuedAnalyticsEvent> =
        value?.let { runCatching { json.decodeFromString<List<QueuedAnalyticsEvent>>(it) }.getOrNull() }.orEmpty()

    private fun isUuid(value: String): Boolean = runCatching { UUID.fromString(value) }.isSuccess
}

class OnboardingAnalyticsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as EmberlistApp
        return if (app.container.onboardingAnalytics.flush()) Result.success() else Result.retry()
    }
}
