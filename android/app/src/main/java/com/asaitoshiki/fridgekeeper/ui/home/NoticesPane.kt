package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyTextColor
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryUrgency

/**
 * お知らせ。
 * 通知は不達前提で設計する（仕様書8.3）。鳴らなかった通知の内容を、
 * 開けばいつでもここで全部読み直せるようにしておく。
 */
@Composable
fun NoticesPane(state: HomeUiState, actions: ItemActions) {
    val context = LocalContext.current
    val dark = LocalIsDarkTheme.current
    val expired = state.expired
    val soon = state.urgent.filter { (it.status.daysLeft ?: 0L) >= 0L }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (expired.isEmpty() && soon.isEmpty()) {
            Text(
                text = "お知らせはありません",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "3日以内に期限を迎える食材はありません。在庫 ${state.totalCount} 件を管理中です。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (expired.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "期限を過ぎています（${expired.size}件）",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = urgencyTextColor(ExpiryUrgency.EXPIRED, dark),
                )
                Text(
                    text = "食べられるかは、見た目やにおいなど実際の状態でご判断ください。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                ItemList(state, expired, actions, "")
            }
        }

        if (soon.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "もうすぐ期限（${soon.size}件）",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                ItemList(state, soon, actions, "")
            }
        }

        if (state.urgent.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = {
                    shareText(context, "使い切りたい食材", urgentShareText(state))
                }) { Text("家族に知らせる") }
            }
        }

        Text(
            text = "通知は端末の設定や電源の状態によって届かないことがあります。" +
                "この画面を開けば、届かなかった分も含めてすべて確認できます。",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
