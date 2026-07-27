package com.notpr.emberlist

import android.app.Application
import androidx.work.Configuration
import com.notpr.emberlist.data.AppContainer
import com.notpr.emberlist.data.backup.BackupScheduler

class EmberlistApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        BackupScheduler.cancel(this)
        container.productActivityAnalyticsBridge.start()
        container.syncCoordinator.start()
    }

    override val workManagerConfiguration: Configuration =
        Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
