package com.notpr.emberlist

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.rules.ExternalResource

class BoundDriveWorkspaceRule : ExternalResource() {
    private val app: EmberlistApp
        get() = ApplicationProvider.getApplicationContext()

    override fun before() {
        runBlocking {
            app.container.settingsRepository.bindDriveWorkspace(
                accountId = "instrumentation-test-account",
                email = "instrumentation@example.invalid",
                displayName = "Instrumentation Test"
            )
        }
    }

    override fun after() {
        runBlocking {
            app.container.settingsRepository.clearDriveWorkspaceBinding()
        }
    }
}
