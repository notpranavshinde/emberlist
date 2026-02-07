package com.notpr.emberlist

import androidx.compose.runtime.compositionLocalOf
import com.notpr.emberlist.data.AppContainer

val LocalAppContainer = compositionLocalOf<AppContainer> {
    error("AppContainer not provided")
}
