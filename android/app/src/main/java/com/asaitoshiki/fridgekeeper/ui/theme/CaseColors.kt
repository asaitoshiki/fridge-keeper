package com.asaitoshiki.fridgekeeper.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * 筐体と庫内に使える色。
 * 期限の警告に使う赤・橙・黄はここに入れない。庫内をその色にできてしまうと、
 * 期限切れの食材が背景に紛れて見落とされる（仕様書8.2）。
 */
data class CaseColor(val argb: Long?, val label: String)

val CASE_COLORS: List<CaseColor> = listOf(
    CaseColor(null, "既定"),
    CaseColor(0xFFD8E4EB, "ステンレス"),
    CaseColor(0xFFF4F6F7, "ホワイト"),
    CaseColor(0xFF93A0AA, "グレー"),
    CaseColor(0xFF2F3A42, "チャコール"),
    CaseColor(0xFF26405C, "ネイビー"),
    CaseColor(0xFF3F6B63, "ディープグリーン"),
    CaseColor(0xFFE8DDCC, "ベージュ"),
    CaseColor(0xFFC0A98F, "ウッド"),
)

fun colorOf(argb: Long?): Color? = argb?.let { Color(it.toInt()) }

/**
 * 背景の明るさから文字色を決める。
 * 濃い色を選んだときに段の名前が読めなくなるのを防ぐ。
 */
fun inkFor(background: Color): Color {
    val luminance = 0.299f * background.red + 0.587f * background.green + 0.114f * background.blue
    return if (luminance > 0.55f) Color(0xFF1B2A32) else Color(0xFFEFF5F8)
}
