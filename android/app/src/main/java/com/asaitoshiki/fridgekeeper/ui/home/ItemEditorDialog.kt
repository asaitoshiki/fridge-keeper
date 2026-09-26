@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.domain.expiry.PresetExpiryTable
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.ui.jp
import com.asaitoshiki.fridgekeeper.ui.label
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** 収納の選択肢。「まだ入れない」も選べるようにしておく */
private data class PlaceOption(val id: String?, val label: String)

@Composable
fun ItemEditorDialog(
    state: HomeUiState,
    item: FoodItemEntity,
    onDismiss: () -> Unit,
    onSave: (FoodItemEntity) -> Unit,
    onDelete: () -> Unit,
) {
    var draft by remember { mutableStateOf(item) }
    var quantityText by remember { mutableStateOf(item.quantity.toString()) }
    var showDatePicker by remember { mutableStateOf(false) }

    val places = remember(state.units) {
        listOf(PlaceOption(null, "まだ入れない（買ってきたもの）")) +
            state.units.flatMap { unitView ->
                unitView.compartments.map {
                    PlaceOption(
                        it.compartment.id,
                        "${unitView.unit.name} ${it.compartment.name}（${it.compartment.location.label}）",
                    )
                }
            }
    }
    val selectedPlace = places.find { it.id == draft.compartmentId } ?: places.first()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (item.id == 0L) "食材を追加" else "食材を編集") },
        text = {
            Column(
                Modifier
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = draft.name,
                    onValueChange = { draft = draft.copy(name = it) },
                    label = { Text("商品名") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Picker(
                        value = draft.category,
                        options = FoodCategory.entries,
                        labelOf = { it.label },
                        onSelect = { draft = draft.copy(category = it) },
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = quantityText,
                        onValueChange = { text ->
                            quantityText = text.filter { it.isDigit() }
                            draft = draft.copy(quantity = quantityText.toIntOrNull()?.coerceAtLeast(1) ?: 1)
                        },
                        label = { Text("個数") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }

                Picker(
                    value = selectedPlace,
                    options = places,
                    labelOf = { it.label },
                    onSelect = { draft = draft.copy(compartmentId = it.id) },
                )

                Picker(
                    value = draft.expiryType,
                    options = ExpiryType.entries,
                    labelOf = { it.label },
                    onSelect = { draft = draft.copy(expiryType = it) },
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(onClick = { showDatePicker = true }, modifier = Modifier.weight(1f)) {
                        Text(draft.expiryDate?.jp() ?: "期限日を選ぶ（任意）")
                    }
                    if (draft.expiryDate != null) {
                        TextButton(onClick = { draft = draft.copy(expiryDate = null) }) { Text("消す") }
                    }
                }

                /* 期限を入れなくても管理されることが伝わらないと、任意入力が実質必須になってしまう */
                Text(
                    text = hintFor(draft, state),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                OutlinedTextField(
                    value = draft.memo.orEmpty(),
                    onValueChange = { draft = draft.copy(memo = it.ifBlank { null }) },
                    label = { Text("メモ（任意）") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(draft.copy(name = draft.name.trim())) },
                enabled = draft.name.isNotBlank(),
            ) { Text("保存する") }
        },
        dismissButton = {
            Row {
                if (item.id != 0L) {
                    TextButton(
                        onClick = onDelete,
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) { Text("削除") }
                }
                TextButton(onClick = onDismiss) { Text("閉じる") }
            }
        },
    )

    if (showDatePicker) {
        val picker = rememberDatePickerState(
            initialSelectedDateMillis = draft.expiryDate
                ?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        /* ピッカーは UTC の 0 時で返すので、そのまま UTC で日付に戻す */
                        picker.selectedDateMillis?.let { millis ->
                            draft = draft.copy(
                                expiryDate = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate(),
                            )
                        }
                        showDatePicker = false
                    },
                ) { Text("決定") }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("やめる") } },
        ) {
            DatePicker(state = picker)
        }
    }
}

private fun hintFor(draft: FoodItemEntity, state: HomeUiState): String {
    if (draft.expiryDate != null) return "入力された期限日を使います。"

    val location = state.locationOf(draft)
        ?: return "まだどこにも入れていないため期限なしとして扱います。冷蔵庫に入れると目安が付きます。"

    val days = PresetExpiryTable.daysFor(draft.category, location)
        ?: return "${draft.category.label}を${location.label}で保管する場合の目安がないため、期限なしとして扱います。"

    val base = if (draft.id == 0L) LocalDate.now() else draft.registeredAt
    return "期限を空にすると、目安の${days}日を使って ${base.plusDays(days.toLong()).jp()} まで（目安）として表示します。"
}
