@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryUrgency
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.ui.jp
import com.asaitoshiki.fridgekeeper.ui.label
import com.asaitoshiki.fridgekeeper.ui.remainingLabel
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyBarColor
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyTextColor
import kotlin.math.roundToInt

/** ドラッグ中、画面のこの範囲に指が来たら送る */
private const val EDGE_ZONE_DP = 96f
private const val EDGE_SPEED_PX = 26f

@Composable
fun HomeScreen(viewModel: HomeViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val drag = remember { FridgeDragState() }
    val scroll = rememberScrollState()
    val density = LocalDensity.current

    var editing by remember { mutableStateOf<FoodItemEntity?>(null) }
    var confirm by remember { mutableStateOf<ConfirmRequest?>(null) }

    /* 冷蔵庫は一画面に収まらないので、端まで運んだら画面を送る */
    LaunchedEffect(drag.dragging) {
        if (!drag.dragging) return@LaunchedEffect
        val edge = with(density) { EDGE_ZONE_DP.dp.toPx() }
        while (drag.dragging) {
            withFrameNanos { }
            val y = drag.pointer.y - drag.rootOrigin.y
            val bottom = scroll.viewportSize - edge
            when {
                y < edge -> scroll.scrollBy(-EDGE_SPEED_PX)
                y > bottom -> scroll.scrollBy(EDGE_SPEED_PX)
            }
        }
    }

    Scaffold(
        floatingActionButton = {
            if (!state.editingLayout) {
                ExtendedFloatingActionButton(
                    onClick = { editing = newItem() },
                    text = { Text("食材を追加") },
                    icon = { Text("＋", fontSize = 18.sp) },
                )
            }
        },
    ) { insets ->
        Box(
            Modifier
                .padding(insets)
                .fillMaxSize()
                .onGloballyPositioned { drag.rootOrigin = it.boundsInWindow().topLeft },
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(scroll)
                    .padding(horizontal = 16.dp)
                    .padding(top = 16.dp, bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Masthead(state)
                if (state.totalCount > 0) SummaryCard(state)
                TabBar(
                    state = state,
                    onSelectTab = viewModel::selectTab,
                    onToggleEditing = viewModel::toggleLayoutEditing,
                )

                when {
                    state.editingLayout -> LayoutEditor(
                        state = state,
                        onSaveCompartment = viewModel::saveCompartment,
                        onMoveCompartment = viewModel::moveCompartment,
                        onDeleteCompartment = { id ->
                            confirm = confirmDeleteCompartment(state, id) { viewModel.deleteCompartment(id) }
                        },
                        onAddCompartment = viewModel::addCompartment,
                        onRenameUnit = viewModel::renameUnit,
                        onSetUnitType = viewModel::setUnitType,
                        onDeleteUnit = { id ->
                            confirm = confirmDeleteUnit(state, id) { viewModel.deleteUnit(id) }
                        },
                        onAddUnit = viewModel::addUnit,
                    )

                    state.tab == HomeTab.FRIDGE -> FridgeView(
                        state = state,
                        drag = drag,
                        onOpenItem = { editing = it },
                        onDrop = viewModel::move,
                    )

                    else -> ExpiryList(
                        state = state,
                        onSelectFilter = viewModel::setLocationFilter,
                        onOpenItem = { editing = it },
                    )
                }

                Disclaimer()
            }

            /* つまんでいる最中の見え方。指の位置に付いてくる */
            if (drag.dragging) {
                val x = (drag.pointer.x - drag.rootOrigin.x).roundToInt()
                val y = (drag.pointer.y - drag.rootOrigin.y).roundToInt()
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp,
                    shadowElevation = 8.dp,
                    modifier = Modifier.offsetPx(x - 40, y - 18),
                ) {
                    Text(
                        text = drag.label,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }

    editing?.let { item ->
        ItemEditorDialog(
            state = state,
            item = item,
            onDismiss = { editing = null },
            onSave = {
                viewModel.save(it)
                editing = null
            },
            onDelete = {
                viewModel.delete(item)
                editing = null
            },
        )
    }

    confirm?.let { request ->
        ConfirmDialog(
            request = request,
            onDismiss = { confirm = null },
            onConfirm = {
                request.onConfirm()
                confirm = null
            },
        )
    }
}

private fun Modifier.offsetPx(x: Int, y: Int): Modifier = this.then(
    Modifier.layoutOffset(x, y),
)

private fun Modifier.layoutOffset(x: Int, y: Int): Modifier =
    androidx.compose.foundation.layout.offset { IntOffset(x, y) }

private fun newItem(): FoodItemEntity = FoodItemEntity(
    id = 0L,
    name = "",
    category = com.asaitoshiki.fridgekeeper.domain.model.FoodCategory.VEGETABLE,
    compartmentId = null,
    expiryType = ExpiryType.BEST_BEFORE,
    expiryDate = null,
    quantity = 1,
    registeredAt = java.time.LocalDate.now(),
    janCode = null,
    memo = null,
)

/* --- 見出し ------------------------------------------------------------- */

@Composable
private fun Masthead(state: HomeUiState) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            text = "冷蔵庫キーパー",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "${state.totalCount} 件",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * 開いた瞬間に全体の状況が分かるようにする。
 * 通知は不達前提で設計し、アプリを開けば必ず状態が把握できるようにする（仕様書8.3）。
 */
@Composable
private fun SummaryCard(state: HomeUiState) {
    val dark = LocalIsDarkTheme.current
    val worst = state.urgent.firstOrNull()?.status?.urgency ?: ExpiryUrgency.NONE
    val bar = urgencyBarColor(worst, dark)

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
    ) {
        Box(
            Modifier
                .width(5.dp)
                .fillMaxHeight()
                .background(bar),
        )
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = "今日 ${state.today.jp()}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (state.urgent.isEmpty()) {
                Text(
                    text = "3日以内に期限を迎える食材はありません",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "在庫 ${state.totalCount} 件を管理中です。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    text = "使い切りたい食材が ${state.urgent.size} つあります",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = urgencyTextColor(worst, dark),
                )
                val names = state.urgent.take(3).joinToString("、") { it.item.name }
                val rest = if (state.urgent.size > 3) " 他${state.urgent.size - 3}件" else ""
                val expired = state.urgent.count { (it.status.daysLeft ?: 0L) < 0L }
                Text(
                    text = names + rest + if (expired > 0) "／うち期限超過 ${expired}件" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun TabBar(
    state: HomeUiState,
    onSelectTab: (HomeTab) -> Unit,
    onToggleEditing: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                selected = state.tab == HomeTab.FRIDGE && !state.editingLayout,
                onClick = { onSelectTab(HomeTab.FRIDGE) },
                label = { Text("冷蔵庫") },
            )
            FilterChip(
                selected = state.tab == HomeTab.EXPIRY && !state.editingLayout,
                onClick = { onSelectTab(HomeTab.EXPIRY) },
                label = { Text("期限順") },
            )
        }
        if (state.tab == HomeTab.FRIDGE) {
            OutlinedButton(onClick = onToggleEditing) {
                Text(if (state.editingLayout) "編集を終える" else "配置を編集")
            }
        }
    }
}

/* --- 期限順リスト --------------------------------------------------------- */

@Composable
private fun ExpiryList(
    state: HomeUiState,
    onSelectFilter: (StorageLocation?) -> Unit,
    onOpenItem: (FoodItemEntity) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            FilterChip(
                selected = state.locationFilter == null,
                onClick = { onSelectFilter(null) },
                label = { Text("すべて ${state.totalCount}") },
                colors = FilterChipDefaults.filterChipColors(),
            )
            StorageLocation.entries.forEach { location ->
                FilterChip(
                    selected = state.locationFilter == location,
                    onClick = { onSelectFilter(location) },
                    label = { Text("${location.label} ${state.countIn(location)}") },
                )
            }
        }

        val items = state.filteredByExpiry
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)),
        ) {
            if (items.isEmpty()) {
                Text(
                    text = "ここには何もありません",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(28.dp),
                )
            }
            items.forEachIndexed { index, card ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                ExpiryRow(state, card, onOpenItem)
            }
        }
    }
}

@Composable
private fun ExpiryRow(state: HomeUiState, card: ItemCard, onOpenItem: (FoodItemEntity) -> Unit) {
    val dark = LocalIsDarkTheme.current
    Row(
        Modifier
            .fillMaxWidth()
            .height(intrinsicSize = androidx.compose.ui.layout.IntrinsicSize.Min),
    ) {
        Box(
            Modifier
                .width(4.dp)
                .fillMaxHeight()
                .background(urgencyBarColor(card.status.urgency, dark)),
        )
        Column(
            Modifier
                .weight(1f)
                .padding(start = 12.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = card.item.name + if (card.item.quantity > 1) "  ×${card.item.quantity}" else "",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "${state.compartmentPath(card.item.compartmentId)}・${card.item.category.label}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (card.status.estimated && card.status.date != null) EstimateBadge()
                if (card.item.expiryType == ExpiryType.USE_BY) UseByBadge()
            }
        }
        Column(
            Modifier.padding(end = 14.dp, top = 12.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text = card.status.remainingLabel(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = urgencyTextColor(card.status.urgency, dark),
            )
            Text(
                text = card.status.date?.jp() ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = { onOpenItem(card.item) }) { Text("編集") }
    }
}

@Composable
private fun Disclaimer() {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(2.dp))
        Text(
            text = "免責",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "本アプリが表示する期限および目安日数は一般的な参考情報であり、食品の実際の安全性を" +
                "保証するものではありません。実際の日持ちは、購入時の鮮度・開封の有無・保管温度等により" +
                "大きく変動します。喫食の可否は、必ずご自身で食品の状態（見た目・におい等）を確認して" +
                "ご判断ください。本アプリの利用により生じたいかなる損害についても、開発者は一切の責任を" +
                "負いません。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
