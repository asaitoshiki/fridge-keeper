package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.asaitoshiki.fridgekeeper.domain.stats.ConsumptionStats
import com.asaitoshiki.fridgekeeper.ui.label
import com.asaitoshiki.fridgekeeper.ui.theme.FridgeColors
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme

/**
 * レポート。
 * 続いている日数を主役に置く。捨てた量を責める画面にはしない。
 */
@Composable
fun ReportPane(state: HomeUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        StreakCard(state)
        StatsBlock("この7日間", state.stats7)
        StatsBlock("この30日間", state.stats30)
        DiscardChart(state.stats30)

        Text(
            text = "食べきり率は、減らした数のうち食べた分の割合です。記録がない間は出しません。",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StreakCard(state: HomeUiState) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "食品ロスなし継続",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "${state.streak}",
                fontSize = 36.sp,
                lineHeight = 40.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "日",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(bottom = 6.dp),
            )
        }
        Text(
            text = "これまでの最長は ${state.bestStreak} 日です。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StatsBlock(title: String, stats: ConsumptionStats) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = title, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Metric("食べた", "${stats.eaten}", Modifier.weight(1f))
            Metric("捨てた", "${stats.discarded}", Modifier.weight(1f))
            Metric(
                label = "食べきり率",
                /* 記録が無い間は 0% と書かない。全部捨てたように見えてしまう */
                value = stats.rate?.let { "${(it * 100).toInt()}%" } ?: "—",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .padding(vertical = 12.dp, horizontal = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

/** 何を捨てがちかを横棒で見せる。次に買う量を決める手がかりになる */
@Composable
private fun DiscardChart(stats: ConsumptionStats) {
    if (stats.discardedByCategory.isEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "捨てたものの内訳",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "この30日間、捨てた記録はありません。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val dark = LocalIsDarkTheme.current
    val fill = if (dark) FridgeColors.accentDark else FridgeColors.accentLight
    val max = stats.discardedByCategory.first().count.coerceAtLeast(1)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "捨てたものの内訳（30日）",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
        )
        stats.discardedByCategory.forEach { entry ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = entry.category.label,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.width(56.dp),
                )
                Box(
                    Modifier
                        .weight(1f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(entry.count.toFloat() / max)
                            .height(14.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(fill),
                    )
                }
                Text(text = "${entry.count}", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
