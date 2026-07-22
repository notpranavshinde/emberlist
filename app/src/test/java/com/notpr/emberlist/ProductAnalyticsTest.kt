package com.notpr.emberlist

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.analytics.OnboardingAnalytics
import com.notpr.emberlist.data.settings.SettingsRepository
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class ProductAnalyticsTest {
    private lateinit var file: File
    private lateinit var scope: TestScope
    private lateinit var analytics: OnboardingAnalytics
    private lateinit var store: androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>

    @Before
    fun setUp() {
        file = File.createTempFile("emberlist-product-analytics", ".preferences_pb").apply { delete() }
        scope = TestScope(UnconfinedTestDispatcher())
        store = PreferenceDataStoreFactory.create(scope = scope, produceFile = { file })
        analytics = OnboardingAnalytics(
            ApplicationProvider.getApplicationContext(), store, SettingsRepository(store), workScheduler = {}
        )
    }

    @After
    fun tearDown() { scope.cancel(); file.delete() }

    @Test
    fun installIdIsDurableAndPayloadContainsNoTaskContent() = runBlocking {
        analytics.track("task_create_result", mapOf("result" to "success", "countBucket" to "1"), mapOf("recurring" to true))
        analytics.track("task_completed", emptyMap(), mapOf("subtask" to false))
        val preferences = store.data.first()
        val installId = preferences.asMap().entries.firstOrNull { it.key.name == "product_analytics_install_id_v2" }?.value as? String
        val queue = preferences.asMap().entries.firstOrNull { it.key.name == "product_analytics_queue_v2" }?.value as? String
        assertNotNull(installId)
        assertEquals(36, installId?.length)
        assertTrue(queue?.contains(installId!!) == true)
        assertFalse(queue?.contains("title") == true)
        assertFalse(queue?.contains("description") == true)
        assertFalse(queue?.contains("projectName") == true)
    }

    @Test
    fun appOpenedIsDebouncedAndOptOutRemovalClearsIdAndQueue() = runBlocking {
        val start = 2_000_000_000_000L
        analytics.trackAppOpened(start)
        analytics.trackAppOpened(start + 1_000)
        val queue = store.data.first().asMap().entries.first { it.key.name == "product_analytics_queue_v2" }.value.toString()
        assertEquals(1, Regex("app_opened").findAll(queue).count())

        analytics.clearQueueAndId()
        val names = store.data.first().asMap().keys.map { it.name }
        assertFalse("product_analytics_install_id_v2" in names)
        assertFalse("product_analytics_queue_v2" in names)
        assertFalse("product_analytics_last_session_v2" in names)
    }
}
