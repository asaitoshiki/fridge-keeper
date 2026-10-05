package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryUrgency
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyBarColor
import kotlin.math.roundToInt

/* 指を離した位置でどの操作になるか。浅く引けば1つ、深く引けば食べきり */
private const val ACT_DP = 76f
private const val DEEP_DP = 168f

/**
 * 横に引いて減らす行。
 * 食べた・捨てたは一日に何度も起きるので、画面を開き直さずその場で終われるようにする。
 * 右へ引けば食べた、左へ引けば捨てた。どちらも Undo で戻せる。
 */
@Composable
fun SwipeRow(
    onEatOne: () -> Unit,
    onEatAll: () -> Unit,
    onDiscard: () -> Unit,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val act = with(density) { ACT_DP.dp.toPx() }
    val deep = with(density) { DEEP_DP.dp.toPx() }
    var dragX by remember { mutableFloatStateOf(0f) }
    val dark = LocalIsDarkTheme.current

    Box(Modifier.fillMaxWidth()) {
        /* 背景の文字が、離したときに何が起きるかを先に伝える */
        val hint = when {
            dragX >= deep -> "食べきった"
            dragX >= act -> "1つ食べた"
            dragX <= -act -> "捨てた"
            else -> ""
        }
        Row(
            Modifier
                .matchParentSize()
                .background(backdropColor(dragX, act, deep, dark))
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (dragX >= 0f) Arrangement.Start else Arrangement.End,
        ) {
            if (hint.isNotEmpty()) {
                Text(
                    text = hint,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }

        Box(
            Modifier
                .offset { IntOffset(dragX.roundToInt(), 0) }
                .background(MaterialTheme.colorScheme.surface)
                .fillMaxWidth()
                .pointerInput(onEatOne, onEatAll, onDiscard) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val settled = dragX
                            dragX = 0f
                            when {
                                settled >= deep -> onEatAll()
                                settled >= act -> onEatOne()
                                settled <= -act -> onDiscard()
                            }
                        },
                        onDragCancel = { dragX = 0f },
                    ) { _, delta ->
                        dragX = (dragX + delta).coerceIn(-deep, deep)
                    }
                },
        ) {
            content()
        }
    }
}

/** 引いた向きと深さで背景の色を決める。捨てる側は期限切れと同じ赤にする */
private fun backdropColor(x: Float, act: Float, deep: Float, dark: Boolean): Color = when {
    x <= -act -> urgencyBarColor(ExpiryUrgency.EXPIRED, dark)
    x >= deep -> urgencyBarColor(ExpiryUrgency.WARN, dark)
    x >= act -> urgencyBarColor(ExpiryUrgency.CAUTION, dark)
    else -> Color.Transparent
}
