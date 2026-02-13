package com.notpr.emberlist

import android.app.Application
import androidx.work.Configuration
import com.notpr.emberlist.data.AppContainer
import com.google.android.libraries.places.api.Places
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class EmberlistApp : Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        val key = BuildConfig.MAPS_API_KEY
        if (key.isNotBlank() && !Places.isInitialized()) {
            Places.initialize(applicationContext, key)
        }
        CoroutineScope(Dispatchers.IO).launch {
            container.geofenceScheduler.refresh()
        }
    }

    override val workManagerConfiguration: Configuration =
        Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
