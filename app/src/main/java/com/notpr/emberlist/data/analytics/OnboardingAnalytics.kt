package com.notpr.emberlist.data.analytics

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
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
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

@Serializable
data class QueuedAnalyticsEvent(
    val createdAt: Long,
    val payload: AnalyticsPayload
)

@Serializable
data class AnalyticsPayload(
    val schemaVersion: Int = 1,
    val eventId: String,
    val event: String,
    val platform: String = "android",
    val appVersion: String,
    val onboardingVersion: Int = 2,
    val properties: Map<String, String> = emptyMap()
)

class OnboardingAnalytics(
    private val context: Context,
    private val dataStore: DataStore<Preferences>,
    private val settingsRepository: SettingsRepository
) {
    companion object {
        private val KEY_QUEUE = stringPreferencesKey("onboarding_analytics_queue")
        private const val MAX_QUEUE = 20
        private const val EVENT_TTL_MS = 7L * 24 * 60 * 60 * 1_000
        private const val ENDPOINT = "https://emberlist.dev/api/analytics/onboarding"
        private val json = Json { ignoreUnknownKeys = false }
        private val allowedEvents = setOf(
            "onboarding_viewed", "onboarding_primary_clicked", "onboarding_example_clicked",
            "onboarding_skipped", "onboarding_restore_started", "onboarding_restore_result",
            "onboarding_completed"
        )
        private val allowedProperties = mapOf(
            "method" to setOf("first_task", "drive_restore"),
            "result" to setOf("success", "empty", "cancelled", "offline", "error"),
            "exampleKind" to setOf("simple", "scheduled", "recurring"),
            "elapsedBucket" to setOf("under_30s", "30_to_60s", "1_to_5m", "over_5m")
        )
    }

    suspend fun track(event: String, properties: Map<String, String> = emptyMap()) {
        if (event !in allowedEvents || properties.any { (key, value) -> value !in allowedProperties[key].orEmpty() }) return
        if (!settingsRepository.settings.first().analyticsEnabled) return
        val now = System.currentTimeMillis()
        dataStore.edit { prefs ->
            val queue = decodeQueue(prefs[KEY_QUEUE]).filter { now - it.createdAt <= EVENT_TTL_MS }.toMutableList()
            queue += QueuedAnalyticsEvent(
                createdAt = now,
                payload = AnalyticsPayload(
                    eventId = UUID.randomUUID().toString(),
                    event = event,
                    appVersion = BuildConfig.VERSION_NAME,
                    properties = properties
                )
            )
            prefs[KEY_QUEUE] = json.encodeToString(queue.takeLast(MAX_QUEUE))
        }
        scheduleFlush()
    }

    suspend fun clearQueue() {
        dataStore.edit { it.remove(KEY_QUEUE) }
    }

    suspend fun flush(): Boolean = withContext(Dispatchers.IO) {
        if (!settingsRepository.settings.first().analyticsEnabled) {
            clearQueue()
            return@withContext true
        }
        val now = System.currentTimeMillis()
        val queue = decodeQueue(dataStore.data.first()[KEY_QUEUE])
            .filter { now - it.createdAt <= EVENT_TTL_MS }
            .toMutableList()
        while (queue.isNotEmpty()) {
            if (!send(queue.first().payload)) return@withContext false
            queue.removeAt(0)
            dataStore.edit { prefs ->
                if (queue.isEmpty()) prefs.remove(KEY_QUEUE)
                else prefs[KEY_QUEUE] = json.encodeToString(queue)
            }
        }
        true
    }

    private fun scheduleFlush() {
        val request = OneTimeWorkRequestBuilder<OnboardingAnalyticsWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "onboarding-analytics",
            ExistingWorkPolicy.KEEP,
            request
        )
    }

    private fun send(payload: AnalyticsPayload): Boolean {
        val connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5_000
            readTimeout = 5_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        return runCatching {
            connection.outputStream.use { it.write(json.encodeToString(payload).toByteArray()) }
            connection.responseCode in 200..299
        }.getOrDefault(false).also { connection.disconnect() }
    }

    private fun decodeQueue(value: String?): List<QueuedAnalyticsEvent> =
        value?.let { runCatching { json.decodeFromString<List<QueuedAnalyticsEvent>>(it) }.getOrNull() }.orEmpty()
}

class OnboardingAnalyticsWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as EmberlistApp
        return if (app.container.onboardingAnalytics.flush()) Result.success() else Result.retry()
    }
}
