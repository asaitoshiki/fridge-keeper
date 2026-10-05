package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import com.asaitoshiki.fridgekeeper.ui.label
import com.asaitoshiki.fridgekeeper.ui.theme.CASE_COLORS
import com.asaitoshiki.fridgekeeper.ui.theme.colorOf

/**
 * 配置の編集。
 * 段の名前・種類・形・幅・高さ・並び順を変えられる。
 * 変えられるのは見た目と、期限の目安を引く種類だけで、既にある食材は失われない。
 */
@Composable
fun LayoutEditor(
    state: HomeUiState,
    onSaveCompartment: (CompartmentEntity) -> Unit,
    onMoveCompartment: (String, String, Int) -> Unit,
    onDeleteCompartment: (String) -> Unit,
    onAddCompartment: (String) -> Unit,
    onRenameUnit: (StorageUnitEntity, String) -> Unit,
    onSetUnitType: (StorageUnitEntity, StorageUnitType) -> Unit,
    onSetUnitColor: (StorageUnitEntity, Long?) -> Unit,
    onDeleteUnit: (String) -> Unit,
    onAddUnit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(
            text = "段の名前・種類・形・幅・高さを変えられます。形を「引き出し」にすると独立した" +
                "引き出しになり、幅を「半分」にすると隣の段と横に並びます。" +
                "段を消すと、中の食材は「買ってきたもの」に戻ります。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        state.units.forEach { unitView ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = unitView.unit.name,
                        onValueChange = { onRenameUnit(unitView.unit, it) },
                        label = { Text("収納の名前") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(
                        onClick = { onDeleteUnit(unitView.unit.id) },
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) { Text("削除") }
                }

                Picker(
                    value = unitView.unit.type,
                    options = StorageUnitType.entries,
                    labelOf = { "見た目：${it.label}" },
                    onSelect = { onSetUnitType(unitView.unit, it) },
                )

                ColorField(
                    title = "筐体の色",
                    selected = unitView.unit.colorArgb,
                    onSelect = { onSetUnitColor(unitView.unit, it) },
                )

                unitView.compartments.forEachIndexed { index, view ->
                    CompartmentEditor(
                        compartment = view.compartment,
                        isFirst = index == 0,
                        isLast = index == unitView.compartments.lastIndex,
                        onSave = onSaveCompartment,
                        onMove = { delta -> onMoveCompartment(unitView.unit.id, view.compartment.id, delta) },
                        onDelete = { onDeleteCompartment(view.compartment.id) },
                    )
                }

                OutlinedButton(
                    onClick = { onAddCompartment(unitView.unit.id) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("＋ 段を追加") }
            }
        }

        Button(onClick = onAddUnit, modifier = Modifier.fillMaxWidth()) { Text("＋ 収納を追加") }
    }
}

@Composable
private fun CompartmentEditor(
    compartment: CompartmentEntity,
    isFirst: Boolean,
    isLast: Boolean,
    onSave: (CompartmentEntity) -> Unit,
    onMove: (Int) -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = compartment.name,
            onValueChange = { onSave(compartment.copy(name = it)) },
            label = { Text("段の名前") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Picker(
                value = compartment.location,
                options = StorageLocation.entries,
                labelOf = { it.label },
                onSelect = { onSave(compartment.copy(location = it)) },
                modifier = Modifier.weight(1f),
            )
            Picker(
                value = compartment.form,
                options = CompartmentForm.entries,
                labelOf = { it.label },
                onSelect = { onSave(compartment.copy(form = it)) },
                modifier = Modifier.weight(1f),
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = { onSave(compartment.copy(widthPercent = (compartment.widthPercent - 25).coerceAtLeast(25))) },
                enabled = compartment.widthPercent > 25,
            ) { Text("幅 −") }
            Text("${compartment.widthPercent}%", style = MaterialTheme.typography.labelMedium)
            OutlinedButton(
                onClick = { onSave(compartment.copy(widthPercent = (compartment.widthPercent + 25).coerceAtMost(100))) },
                enabled = compartment.widthPercent < 100,
            ) { Text("幅 ＋") }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = { onSave(compartment.copy(heightDp = (compartment.heightDp - 12).coerceAtLeast(36))) },
                enabled = compartment.heightDp > 36,
            ) { Text("高さ −") }
            Text("${compartment.heightDp}", style = MaterialTheme.typography.labelMedium)
            OutlinedButton(
                onClick = { onSave(compartment.copy(heightDp = (compartment.heightDp + 12).coerceAtMost(220))) },
                enabled = compartment.heightDp < 220,
            ) { Text("高さ ＋") }
        }

        ColorField(
            title = "庫内の色",
            selected = compartment.colorArgb,
            onSelect = { onSave(compartment.copy(colorArgb = it)) },
        )

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(onClick = { onMove(-1) }, enabled = !isFirst) { Text("↑") }
            OutlinedButton(onClick = { onMove(1) }, enabled = !isLast) { Text("↓") }
            TextButton(
                onClick = onDelete,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text("この段を削除") }
        }
    }
}

/**
 * 色の選択。
 * 期限の警告に使う赤・橙・黄は候補に入れない。庫内をその色にできてしまうと、
 * 期限切れの食材が背景に紛れて見落とされる（仕様書8.2）。
 */
@Composable
private fun ColorField(title: String, selected: Long?, onSelect: (Long?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            CASE_COLORS.forEach { option ->
                val isSelected = option.argb == selected
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(7.dp))
                        .background(
                            colorOf(option.argb) ?: MaterialTheme.colorScheme.surfaceVariant,
                        )
                        .border(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            },
                            shape = RoundedCornerShape(7.dp),
                        )
                        .clickable { onSelect(option.argb) },
                    contentAlignment = Alignment.Center,
                ) {
                    /* 「既定」は色が無いので、斜線の代わりに短い印を置く */
                    if (option.argb == null) {
                        Text(
                            text = "既",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
