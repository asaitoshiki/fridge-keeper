package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.data.local.entity.ShoppingItemEntity

/**
 * 買い物リスト。
 * 家族との共有はサーバーを持たず、OS の共有シートへ本文を投げて済ませる。
 */
@Composable
fun ShoppingPane(
    state: HomeUiState,
    onAdd: (String) -> Unit,
    onToggle: (ShoppingItemEntity) -> Unit,
    onDelete: (ShoppingItemEntity) -> Unit,
    onStockUp: (ShoppingItemEntity) -> Unit,
    onClearDone: () -> Unit,
) {
    val context = LocalContext.current
    var input by remember { mutableStateOf("") }
    val done = state.shopping.count { it.done }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("買うもの") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            FilledTonalButton(
                onClick = {
                    onAdd(input)
                    input = ""
                },
                enabled = input.isNotBlank(),
            ) { Text("追加") }
        }

        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)),
        ) {
            if (state.shopping.isEmpty()) {
                Text(
                    text = "買い物リストは空です",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(28.dp),
                )
            }
            state.shopping.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = item.done, onCheckedChange = { onToggle(item) })
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (item.done) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        textDecoration = if (item.done) TextDecoration.LineThrough else null,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    /* 買えたものは在庫へ移す。二度打ち込ませないための導線 */
                    TextButton(onClick = { onStockUp(item) }) { Text("入れた") }
                    TextButton(onClick = { onDelete(item) }) { Text("削除") }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = {
                    shareText(context, "買い物リスト", shoppingShareText(state))
                },
                enabled = state.shopping.any { !it.done },
            ) { Text("家族に送る") }
            if (done > 0) {
                OutlinedButton(onClick = onClearDone) { Text("買えた${done}件を消す") }
            }
        }

        if (state.recentNames.isNotEmpty()) {
            Text(
                text = "よく登録するもの",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                state.recentNames.take(4).forEach { name ->
                    OutlinedButton(onClick = { onAdd(name) }) {
                        Text(
                            text = name,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }
    }
}
