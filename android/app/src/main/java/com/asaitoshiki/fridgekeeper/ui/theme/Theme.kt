package com.asaitoshiki.fridgekeeper.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

/**
 * 配色は Material 3 の既定に従う。
 * 期限内であることを緑などで「安全」と印象づけないため、独自のブランドカラーは置かない。
 * 緊急度の色は Phase 2 でリスト側に定義する。
 */
@Composable
fun FridgeKeeperTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme(),
        content = content,
    )
}
