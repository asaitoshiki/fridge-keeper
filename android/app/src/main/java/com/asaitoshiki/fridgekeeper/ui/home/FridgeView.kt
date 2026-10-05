@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import com.asaitoshiki.fridgekeeper.ui.label
import com.asaitoshiki.fridgekeeper.ui.theme.FridgeColors
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme

/**
 * 段の並びを、扉ひとつ分と引き出しひとつ分の区画にまとめる。
 * 実際の冷蔵庫は「棚が何段か入った扉」の下に「引き出しが積まれる」構造なので、
 * 連続する棚・ドアポケットを1枚の扉として束ね、引き出しはそれぞれ独立させる。
 * 半幅の引き出しが連続したときは、製氷室と小さな冷凍室のように横へ並べる。
 */
private sealed interface Section {
    data class Door(val items: List<CompartmentView>) : Section
    data class Drawer(val items: List<CompartmentView>) : Section {
        val usedWidth: Int get() = items.sumOf { it.compartment.widthPercent }
    }
}

private fun sectionsOf(compartments: List<CompartmentView>): List<Section> {
    val out = mutableListOf<Section>()
    var door: MutableList<CompartmentView>? = null

    compartments.forEach { view ->
        if (view.compartment.form != CompartmentForm.DRAWER) {
            if (door == null) {
                door = mutableListOf()
                out.add(Section.Door(door!!))
            }
            door!!.add(view)
            return@forEach
        }

        door = null
        val last = out.lastOrNull()
        /* 行の幅が100%を超えないうちは、同じ行へ並べる */
        if (last is Section.Drawer && last.usedWidth + view.compartment.widthPercent <= 100) {
            out[out.lastIndex] = Section.Drawer(last.items + view)
            return@forEach
        }
        out.add(Section.Drawer(listOf(view)))
    }
    return out
}

@Composable
fun FridgeView(
    state: HomeUiState,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        state.units.forEach { unitView -> UnitBox(unitView, drag, onOpenItem, onDrop) }
        Tray(state.unplaced, drag, onOpenItem, onDrop)
    }
}

@Composable
private fun UnitBox(
    unitView: UnitView,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    val dark = LocalIsDarkTheme.current
    val isFridge = unitView.unit.type == StorageUnitType.FRIDGE
    val case = if (dark) FridgeColors.caseDark else FridgeColors.caseLight
    val chrome = if (dark) FridgeColors.chromeDark else FridgeColors.chromeLight

    Column {
        Text(
            text = unitView.unit.name,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
        )

        /* 天面。上辺を狭めた板にして、少し上から見下ろした箱に見せる */
        if (isFridge) {
            Box(
                Modifier
                    .padding(horizontal = 14.dp)
                    .fillMaxWidth()
                    .height(14.dp)
                    .clip(RoundedCornerShape(topStart = 9.dp, topEnd = 9.dp))
                    .background(Brush.verticalGradient(listOf(chrome.copy(alpha = 0.55f), case))),
            )
        }

        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(if (isFridge) 9.dp else 12.dp))
                .background(case)
                .border(
                    1.dp,
                    MaterialTheme.colorScheme.outlineVariant,
                    RoundedCornerShape(if (isFridge) 9.dp else 12.dp),
                )
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            sectionsOf(unitView.compartments).forEach { section ->
                when (section) {
                    is Section.Door -> DoorBox(section.items, isFridge, drag, onOpenItem, onDrop)
                    is Section.Drawer -> DrawerRow(section.items, drag, onOpenItem, onDrop)
                }
            }
        }

        /* 脚 */
        if (isFridge) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                repeat(2) {
                    Box(
                        Modifier
                            .width(30.dp)
                            .height(6.dp)
                            .clip(RoundedCornerShape(bottomStart = 4.dp, bottomEnd = 4.dp))
                            .background(chrome),
                    )
                }
            }
        }
    }
}

@Composable
private fun DoorBox(
    items: List<CompartmentView>,
    withHandle: Boolean,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    val dark = LocalIsDarkTheme.current
    val panel = if (dark) FridgeColors.panelDark else FridgeColors.panelLight
    val chrome = if (dark) FridgeColors.chromeDark else FridgeColors.chromeLight

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(panel)
            .padding(start = 9.dp, top = 9.dp, bottom = 9.dp, end = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            items.forEach { CompartmentBox(it, drag, onOpenItem, onDrop) }
        }
        /* 縦の取っ手。冷蔵庫らしさはこの一本が担う */
        if (withHandle) {
            Spacer(Modifier.width(9.dp))
            Box(
                Modifier
                    .width(6.dp)
                    .height(56.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(chrome),
            )
        }
    }
}

@Composable
private fun DrawerRow(
    items: List<CompartmentView>,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { view ->
            DrawerBox(view, drag, onOpenItem, onDrop, Modifier.weight(1f))
        }
    }
}

@Composable
private fun DrawerBox(
    view: CompartmentView,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val dark = LocalIsDarkTheme.current
    val panel = if (dark) FridgeColors.panelDark else FridgeColors.panelLight
    val chrome = if (dark) FridgeColors.chromeDark else FridgeColors.chromeLight

    Column(
        modifier
            .clip(RoundedCornerShape(8.dp))
            .background(panel)
            .padding(9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CompartmentBox(view, drag, onOpenItem, onDrop)
        Spacer(Modifier.height(7.dp))
        /* 前板の横向きの取っ手 */
        Box(
            Modifier
                .fillMaxWidth(0.44f)
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(chrome),
        )
    }
}

/** 庫内。ここが食材の落とし先になる */
@Composable
private fun CompartmentBox(
    view: CompartmentView,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    val dark = LocalIsDarkTheme.current
    val cavity = if (dark) FridgeColors.cavityDark else FridgeColors.cavityLight
    val frost = if (dark) FridgeColors.frostDark else FridgeColors.frostLight
    val compartment = view.compartment
    val isTarget = drag.dragging && drag.target == compartment.id

    val background = when {
        isTarget -> MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
        compartment.location == StorageLocation.FREEZER -> lerpToward(cavity, frost)
        else -> cavity
    }

    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = (compartment.heightDp * 0.68f).dp)
            .onGloballyPositioned { drag.zones[compartment.id] = it.boundsInWindow() }
            .clip(RoundedCornerShape(6.dp))
            .background(background)
            .then(
                if (isTarget) {
                    Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp))
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 7.dp, vertical = 5.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = compartment.name,
                fontSize = 11.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = compartment.location.label,
                fontSize = 9.sp,
                lineHeight = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(3.dp))
                    .padding(horizontal = 3.dp),
            )
        }
        DraggableItems(view.items, drag, onOpenItem, onDrop)
    }
}

@Composable
private fun Tray(
    items: List<ItemCard>,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    val isTarget = drag.dragging && drag.target == TRAY_ZONE

    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .onGloballyPositioned { drag.zones[TRAY_ZONE] = it.boundsInWindow() }
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (isTarget) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                } else {
                    MaterialTheme.colorScheme.surface
                },
            )
            .border(
                2.dp,
                if (isTarget) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(14.dp),
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(
                text = "買ってきたもの",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = if (items.isEmpty()) "ここは空です" else "つまんで冷蔵庫へ入れる",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DraggableItems(items, drag, onOpenItem, onDrop)
    }
}

@Composable
private fun DraggableItems(
    items: List<ItemCard>,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        items.forEach { card -> DraggableChip(card, drag, onOpenItem, onDrop) }
    }
}

@Composable
private fun DraggableChip(
    card: ItemCard,
    drag: FridgeDragState,
    onOpenItem: (FoodItemEntity) -> Unit,
    onDrop: (Long, String?) -> Unit,
) {
    /* 指の位置をウィンドウ基準に直すため、チップ自身の位置を覚えておく */
    var origin by remember { mutableStateOf(Offset.Zero) }

    ItemChip(
        card = card,
        lifted = drag.itemId == card.item.id,
        modifier = Modifier
            .onGloballyPositioned { origin = it.boundsInWindow().topLeft }
            .pointerInput(card.item.id) {
                detectTapGestures { onOpenItem(card.item) }
            }
            .pointerInput(card.item.id) {
                detectDragGestures(
                    onDragStart = { local -> drag.start(card.item.id, card.item.name, origin + local) },
                    onDrag = { change, delta ->
                        change.consume()
                        drag.moveBy(delta)
                    },
                    onDragEnd = {
                        /* 落とし先を読んでから状態を畳む。順番を逆にすると宛先を失う */
                        val target = drag.target
                        val id = drag.itemId
                        drag.stop()
                        if (id != null && target != null) {
                            onDrop(id, if (target == TRAY_ZONE) null else target)
                        }
                    },
                    onDragCancel = { drag.stop() },
                )
            },
    )
}

/** 冷凍室の霜を、庫内の色にうっすら重ねる */
private fun lerpToward(base: Color, overlay: Color): Color = Color(
    red = base.red * (1f - overlay.alpha) + overlay.red * overlay.alpha,
    green = base.green * (1f - overlay.alpha) + overlay.green * overlay.alpha,
    blue = base.blue * (1f - overlay.alpha) + overlay.blue * overlay.alpha,
    alpha = 1f,
)
