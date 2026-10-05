package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalTime

/* 通知の時刻は毎時ではなく、暮らしの区切りに合う候補だけ出す */
private val NOTIFY_HOURS = listOf(6, 7, 8, 9, 10, 11, 12, 15, 17, 18, 19, 20, 21)
private val DAYS_BEFORE = listOf(1, 2, 3, 5, 7)

/** 設定。通知の条件と、免責の全文を置く */
@Composable
fun SettingsPane(
    state: HomeUiState,
    onSaveNotify: (Boolean, LocalTime, Int) -> Unit,
) {
    val settings = state.settings

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(text = "通知", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(text = "期限が近い食材を知らせる", style = MaterialTheme.typography.bodyMedium)
                Text(
                    text = "端末の設定や電源の状態によっては届きません。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = settings.notifyEnabled,
                onCheckedChange = {
                    onSaveNotify(it, settings.notifyTime, settings.notifyDaysBefore)
                },
            )
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "知らせる時刻",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Picker(
                    value = settings.notifyTime.hour,
                    options = NOTIFY_HOURS,
                    labelOf = { "${it}:00" },
                    onSelect = {
                        onSaveNotify(
                            settings.notifyEnabled,
                            LocalTime.of(it, 0),
                            settings.notifyDaysBefore,
                        )
                    },
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "何日前から",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Picker(
                    value = settings.notifyDaysBefore,
                    options = DAYS_BEFORE,
                    labelOf = { "${it}日前から" },
                    onSelect = {
                        onSaveNotify(settings.notifyEnabled, settings.notifyTime, it)
                    },
                )
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        Text(text = "このアプリについて", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Text(
            text = "データは端末の中だけに保存されます。外部のサーバーへ送信することはありません。" +
                "家族への共有は、そのときだけ本文を他のアプリへ渡しています。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "利用開始日：${settings.startedAt}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
