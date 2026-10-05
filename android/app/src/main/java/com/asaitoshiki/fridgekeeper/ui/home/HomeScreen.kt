@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.ui.jp
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyBarColor
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyTextColor
import java.time.LocalDate
import kotlin.math.roundToInt

/** ドラッグ中、画面のこの範囲に指が来たら送る */
private const val EDGE_ZONE_DP = 96f
private const val EDGE_SPEED_PX = 26f

@Composable
fun HomeScreen(viewModel: HomeViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val undo by viewModel.undo.collectAsStateWithLifecycle()
    val drag = remember { FridgeDragState() }
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    val snackbar = remember { SnackbarHostState() }

    var editing by remember { mutableStateOf<FoodItemEntity?>(null) }
    var confirm by remember { mutableStateOf<ConfirmRequest?>(null) }

    val actions = remember(viewModel) {
        ItemActions(
            onOpen = { editing = it },
            onEatOne = viewModel::eatOne,
            onEatAll = viewModel::eatAll,
            onDiscard = viewModel::discard,
        )
    }

    /* 食べた・捨てたは指の滑りでも起きるので、必ず戻せることをその場で見せる */
    LaunchedEffect(undo) {
        val prompt = undo ?: return@LaunchedEffect
        val result = snackbar.showSnackbar(prompt.text, actionLabel = "もどす")
        if (result == SnackbarResult.ActionPerformed) viewModel.runUndo(prompt) else viewModel.dismissUndo()
    }

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
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = state.tab.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    Text(
                        text = "${state.totalCount} 件",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 16.dp),
                    )
                },
            )
        },
        bottomBar = {
            Column {
                /* 買ってきたものをその場で放り込める入口。冷蔵庫を見ているときだけ出す */
                if (state.tab == AppTab.FRIDGE && !state.editingLayout) {
                    QuickAddBar(state, onAdd = viewModel::quickAdd, onOpenEditor = { editing = newItem() })
                }
                NavigationBar {
                    AppTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = state.tab == tab,
                            onClick = { viewModel.selectTab(tab) },
                            icon = { Icon(tab.icon, contentDescription = tab.title) },
                            label = { Text(tab.title, fontSize = 10.sp) },
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
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
                    .padding(top = 14.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when (state.tab) {
                    AppTab.FRIDGE -> {
                        if (state.totalCount > 0) SummaryCard(state)
                        StreakLine(state)
                        FridgeModeBar(
                            state = state,
                            onSelectMode = viewModel::setFridgeMode,
                            onToggleEditing = viewModel::toggleLayoutEditing,
                        )
                        when {
                            state.editingLayout -> LayoutEditor(
                                state = state,
                                onSaveCompartment = viewModel::saveCompartment,
                                onMoveCompartment = viewModel::moveCompartment,
                                onDeleteCompartment = { id ->
                                    confirm = confirmDeleteCompartment(state, id) {
                                        viewModel.deleteCompartment(id)
                                    }
                                },
                                onAddCompartment = viewModel::addCompartment,
                                onRenameUnit = viewModel::renameUnit,
                                onSetUnitType = viewModel::setUnitType,
                                onSetUnitColor = viewModel::setUnitColor,
                                onDeleteUnit = { id ->
                                    confirm = confirmDeleteUnit(state, id) { viewModel.deleteUnit(id) }
                                },
                                onAddUnit = viewModel::addUnit,
                            )

                            state.fridgeMode == FridgeMode.FIGURE -> FridgeView(
                                state = state,
                                drag = drag,
                                onOpenItem = { editing = it },
                                onDrop = viewModel::move,
                            )

                            else -> ExpiryPane(
                                state = state,
                                actions = actions,
                                onSelectFilter = viewModel::setLocationFilter,
                            )
                        }
                        Disclaimer()
                    }

                    AppTab.SHOPPING -> ShoppingPane(
                        state = state,
                        onAdd = viewModel::addShopping,
                        onToggle = viewModel::toggleShopping,
                        onDelete = viewModel::deleteShopping,
                        onStockUp = viewModel::stockUpShopping,
                        onClearDone = viewModel::clearDoneShopping,
                    )

                    AppTab.NOTICES -> {
                        NoticesPane(state, actions)
                        Disclaimer()
                    }

                    AppTab.REPORT -> ReportPane(state)

                    AppTab.SETTINGS -> {
                        SettingsPane(state, onSaveNotify = viewModel::saveNotify)
                        Disclaimer()
                    }
                }
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
                    modifier = Modifier.offset { IntOffset(x - 40, y - 18) },
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

private val AppTab.title: String
    get() = when (this) {
        AppTab.FRIDGE -> "冷蔵庫"
        AppTab.SHOPPING -> "買い物"
        AppTab.NOTICES -> "お知らせ"
        AppTab.REPORT -> "レポート"
        AppTab.SETTINGS -> "設定"
    }

private val AppTab.icon: ImageVector
    get() = when (this) {
        AppTab.FRIDGE -> Icons.Filled.Home
        AppTab.SHOPPING -> Icons.Filled.ShoppingCart
        AppTab.NOTICES -> Icons.Filled.Notifications
        AppTab.REPORT -> Icons.Filled.List
        AppTab.SETTINGS -> Icons.Filled.Settings
    }

private fun newItem(): FoodItemEntity = FoodItemEntity(
    id = 0L,
    name = "",
    category = FoodCategory.VEGETABLE,
    compartmentId = null,
    expiryType = ExpiryType.BEST_BEFORE,
    expiryDate = null,
    quantity = 1,
    registeredAt = LocalDate.now(),
    janCode = null,
    memo = null,
)

/* --- 下の入力バー --------------------------------------------------------- */

/**
 * 名前だけ打ち込んで放り込むバー。
 * 買ってきたものを一気に登録するときは、期限もカテゴリも後回しにできたほうが早い。
 */
@Composable
private fun QuickAddBar(
    state: HomeUiState,
    onAdd: (String) -> Unit,
    onOpenEditor: () -> Unit,
) {
    var input by remember { mutableStateOf("") }

    Surface(tonalElevation = 2.dp) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            if (state.recentNames.isNotEmpty() && input.isBlank()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    state.recentNames.take(3).forEach { name ->
                        OutlinedButton(
                            onClick = { onAdd(name) },
                            modifier = Modifier.weight(1f),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                horizontal = 6.dp,
                                vertical = 4.dp,
                            ),
                        ) {
                            Text(
                                text = name,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("食材を入れる", style = MaterialTheme.typography.bodySmall) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                FilledTonalButton(
                    onClick = {
                        onAdd(input)
                        input = ""
                    },
                    enabled = input.isNotBlank(),
                ) { Text("入れる") }
                TextButton(onClick = onOpenEditor) { Text("詳しく") }
            }
        }
    }
}

/* --- 冷蔵庫タブの見出し --------------------------------------------------- */

@Composable
private fun FridgeModeBar(
    state: HomeUiState,
    onSelectMode: (FridgeMode) -> Unit,
    onToggleEditing: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SingleChoiceSegmentedButtonRow {
            SegmentedButton(
                selected = state.fridgeMode == FridgeMode.FIGURE && !state.editingLayout,
                onClick = { onSelectMode(FridgeMode.FIGURE) },
                shape = androidx.compose.material3.SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) { Text("図", style = MaterialTheme.typography.labelMedium) }
            SegmentedButton(
                selected = state.fridgeMode == FridgeMode.EXPIRY && !state.editingLayout,
                onClick = { onSelectMode(FridgeMode.EXPIRY) },
                shape = androidx.compose.material3.SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) { Text("期限順", style = MaterialTheme.typography.labelMedium) }
        }
        if (state.fridgeMode == FridgeMode.FIGURE) {
            TextButton(onClick = onToggleEditing) {
                Text(if (state.editingLayout) "編集を終える" else "配置を編集")
            }
        }
    }
}

/* --- 見出しのまとめ ------------------------------------------------------- */

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
                val expired = state.expired.size
                Text(
                    text = names + rest + if (expired > 0) "／うち期限超過 ${expired}件" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** 続いている日数。レポートを開かなくても目に入る場所に一行だけ置く */
@Composable
private fun StreakLine(state: HomeUiState) {
    Text(
        text = "食品ロスなし ${state.streak}日目（最長 ${state.bestStreak}日）",
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
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
