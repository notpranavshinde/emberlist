package com.notpr.emberlist.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFFEE6A3C),
    onPrimary = Color.White,
    secondary = Color(0xFF1E2D2F),
    onSecondary = Color.White,
    tertiary = Color(0xFFF2D0A4),
    background = Color(0xFFF7F4F0),
    surface = Color.White,
    onBackground = Color(0xFF221E1C),
    onSurface = Color(0xFF221E1C)
)

@Composable
fun EmberlistTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = androidx.compose.material3.Typography(),
        content = content
    )
}
