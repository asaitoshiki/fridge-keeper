package com.asaitoshiki.fridgekeeper.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryUrgency

/**
 * 緊急度に赤・橙・黄を割り当てるため、アクセントは冷たい青緑にしている。
 * 仕様書8.2に従い、期限内であることを緑などで「安全」と印象づける配色はしない。
 * 期限に余裕がある段階では色を付けず、無彩色のままにする。
 */
object FridgeColors {
    val accentLight = Color(0xFF0D6A83)
    val accentDark = Color(0xFF4DC0DC)

    val criticalLight = Color(0xFFB3241F)
    val criticalDark = Color(0xFFFF8A80)
    val criticalBarLight = Color(0xFFE04A3A)
    val criticalBarDark = Color(0xFFE0574A)

    val warnLight = Color(0xFF9A5200)
    val warnDark = Color(0xFFFFB867)
    val warnBarLight = Color(0xFFE2830F)
    val warnBarDark = Color(0xFFE08B2A)

    val cautionLight = Color(0xFF7D6200)
    val cautionDark = Color(0xFFECD276)
    val cautionBarLight = Color(0xFFE7BF2E)
    val cautionBarDark = Color(0xFFD4B43C)

    val calmBarLight = Color(0xFFB6C4CE)
    val calmBarDark = Color(0xFF3C515C)

    val cavityLight = Color(0xFFC3D2DC)
    val cavityDark = Color(0xFF111A1F)
    val panelLight = Color(0xFFF2F7FA)
    val panelDark = Color(0xFF1E2A31)
    val caseLight = Color(0xFFDCE6EC)
    val caseDark = Color(0xFF223038)
    val chromeLight = Color(0xFF9FB0BC)
    val chromeDark = Color(0xFF7D929E)
    val frostLight = Color(0x2978A5BE)
    val frostDark = Color(0x1A8CC8E6)
}

/** 緊急度ごとの文字色。NORMAL と NONE は色を持たせない */
@Composable
@ReadOnlyComposable
fun urgencyTextColor(urgency: ExpiryUrgency, dark: Boolean): Color = when (urgency) {
    ExpiryUrgency.EXPIRED, ExpiryUrgency.CRITICAL ->
        if (dark) FridgeColors.criticalDark else FridgeColors.criticalLight
    ExpiryUrgency.WARN -> if (dark) FridgeColors.warnDark else FridgeColors.warnLight
    ExpiryUrgency.CAUTION -> if (dark) FridgeColors.cautionDark else FridgeColors.cautionLight
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

/** 緊急度ごとの縦バーの色 */
fun urgencyBarColor(urgency: ExpiryUrgency, dark: Boolean): Color = when (urgency) {
    ExpiryUrgency.EXPIRED, ExpiryUrgency.CRITICAL ->
        if (dark) FridgeColors.criticalBarDark else FridgeColors.criticalBarLight
    ExpiryUrgency.WARN -> if (dark) FridgeColors.warnBarDark else FridgeColors.warnBarLight
    ExpiryUrgency.CAUTION -> if (dark) FridgeColors.cautionBarDark else FridgeColors.cautionBarLight
    else -> if (dark) FridgeColors.calmBarDark else FridgeColors.calmBarLight
}
