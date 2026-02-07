package com.notpr.emberlist

import android.app.Application
import androidx.work.Configuration
import com.notpr.emberlist.data.AppContainer

class EmberlistApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }

    override val workManagerConfiguration: Configuration =
        Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
