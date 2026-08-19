package com.notpr.emberlist

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.notpr.emberlist.data.settings.SettingsRepository
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsRepositoryTest {
    private lateinit var file: File
    private lateinit var scope: TestScope
    private lateinit var repository: SettingsRepository

    @Before
    fun setUp() {
        file = File.createTempFile("emberlist-settings", ".preferences_pb").apply { delete() }
        scope = TestScope(UnconfinedTestDispatcher())
        repository = SettingsRepository(
            PreferenceDataStoreFactory.create(scope = scope, produceFile = { file })
        )
    }

    @After
    fun tearDown() {
        scope.cancel()
        file.delete()
    }

    @Test
    fun todayOrganizationPreferencesArePersisted() = runBlocking {
        repository.updateTodaySortMode("PRIORITY")
        repository.updateTodayGroupMode("PROJECT")

        val settings = repository.settings.first()
        assertEquals("PRIORITY", settings.todaySortMode)
        assertEquals("PROJECT", settings.todayGroupMode)
    }
}
