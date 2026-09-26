package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect

/** 「買ってきたもの」置き場を表す落とし先。段の id と同じ入れ物で扱うための空文字 */
const val TRAY_ZONE = ""

/**
 * つまんで運んでいる最中の状態。
 * 座標はすべてウィンドウ基準で持つ。段は縦に長く並び画面内でスクロールするため、
 * 部品ごとのローカル座標では落とし先の判定ができない。
 */
class FridgeDragState {
    var itemId by mutableStateOf<Long?>(null)
        private set
    var label by mutableStateOf("")
        private set
    var pointer by mutableStateOf(Offset.Zero)
        private set
    var rootOrigin by mutableStateOf(Offset.Zero)

    /** 段の id（と置き場）→ ウィンドウ上の範囲 */
    val zones = mutableStateMapOf<String, Rect>()

    val target: String?
        get() = zones.entries.firstOrNull { it.value.contains(pointer) }?.key

    val dragging: Boolean
        get() = itemId != null

    fun start(id: Long, text: String, at: Offset) {
        itemId = id
        label = text
        pointer = at
    }

    fun moveBy(delta: Offset) {
        pointer += delta
    }

    fun stop() {
        itemId = null
        label = ""
    }
}
