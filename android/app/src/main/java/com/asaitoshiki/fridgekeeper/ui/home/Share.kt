package com.asaitoshiki.fridgekeeper.ui.home

import android.content.Context
import android.content.Intent

/**
 * 家族への共有は OS の共有シートへ投げるだけにする。
 * サーバーを持たずに LINE などへ渡せるので、仕様書2章の「完全ローカル完結」を崩さない。
 */
fun shareText(context: Context, title: String, body: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    context.startActivity(Intent.createChooser(intent, title))
}

/** 買い物リストの共有文。チェック済みは外し、未購入だけを並べる */
fun shoppingShareText(state: HomeUiState): String {
    val pending = state.shopping.filter { !it.done }
    if (pending.isEmpty()) return "買い物リストは空です。"
    return buildString {
        appendLine("買い物リスト")
        pending.forEach { appendLine("・${it.name}") }
    }.trimEnd()
}

/** 使い切りたい食材の共有文。期限の種別まで添えないと受け取った側が判断できない */
fun urgentShareText(state: HomeUiState): String {
    if (state.urgent.isEmpty()) return "3日以内に期限を迎える食材はありません。"
    return buildString {
        appendLine("使い切りたい食材")
        state.urgent.forEach { card ->
            val days = card.status.daysLeft
            val when_ = when {
                days == null -> "期限なし"
                days < 0L -> "${-days}日超過"
                days == 0L -> "今日まで"
                else -> "あと${days}日"
            }
            val estimated = if (card.status.estimated && card.status.date != null) "（目安）" else ""
            appendLine("・${card.item.name}　$when_$estimated")
        }
        appendLine()
        append("※期限は参考情報です。食べられるかは実際の状態で判断してください。")
    }
}
