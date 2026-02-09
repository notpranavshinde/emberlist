package com.notpr.emberlist

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.notpr.emberlist.ui.EmberlistAppRoot
import com.notpr.emberlist.ui.theme.EmberlistTheme

class MainActivity : ComponentActivity() {
    private var pendingTaskId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        val app = application as EmberlistApp
        pendingTaskId = intent.getStringExtra("taskId")
        setContent {
            EmberlistTheme {
                Surface {
                    CompositionLocalProvider(LocalAppContainer provides app.container) {
                        EmberlistAppRoot(
                            openTaskId = pendingTaskId,
                            onTaskOpened = { pendingTaskId = null }
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        pendingTaskId = intent.getStringExtra("taskId")
    }
}
