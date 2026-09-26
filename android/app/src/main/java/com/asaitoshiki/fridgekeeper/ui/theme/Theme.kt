package com.asaitoshiki.fridgekeeper.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

/** 図の描画で明暗を切り替えたい箇所が多いので、判定結果を配っておく */
val LocalIsDarkTheme = staticCompositionLocalOf { false }

@Composable
fun FridgeKeeperTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val scheme = if (darkTheme) {
        darkColorScheme(primary = FridgeColors.accentDark)
    } else {
        lightColorScheme(primary = FridgeColors.accentLight)
    }

    CompositionLocalProvider(LocalIsDarkTheme provides darkTheme) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
