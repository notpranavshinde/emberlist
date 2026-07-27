package com.notpr.emberlist

import android.app.Application
import androidx.work.Configuration
import com.notpr.emberlist.data.AppContainer
import com.notpr.emberlist.data.backup.BackupScheduler

open class EmberlistApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = createContainer()
        BackupScheduler.cancel(this)
        container.productActivityAnalyticsBridge.start()
        container.syncCoordinator.start()
    }

    protected open fun createContainer(): AppContainer = AppContainer(this)

    override val workManagerConfiguration: Configuration =
        Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
