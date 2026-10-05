package com.asaitoshiki.fridgekeeper.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.ShoppingItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitWithCompartments
import com.asaitoshiki.fridgekeeper.data.repository.ConsumptionLogRepository
import com.asaitoshiki.fridgekeeper.data.repository.FoodItemRepository
import com.asaitoshiki.fridgekeeper.data.repository.ShoppingRepository
import com.asaitoshiki.fridgekeeper.data.repository.StorageRepository
import com.asaitoshiki.fridgekeeper.data.settings.AppSettings
import com.asaitoshiki.fridgekeeper.data.settings.SettingsRepository
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryStatus
import com.asaitoshiki.fridgekeeper.domain.expiry.expiryStatus
import com.asaitoshiki.fridgekeeper.domain.guessCategoryByName
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import com.asaitoshiki.fridgekeeper.domain.stats.consumptionStats
import com.asaitoshiki.fridgekeeper.domain.stats.streakDays
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import javax.inject.Inject

/** 何日前から「使い切りたい」として扱うか。仕様書6.6の既定値 */
private const val ALERT_THRESHOLD_DAYS = 3L

/**
 * 取り消せる一手。
 * 食べた・捨てたは指の滑りでも起きるので、必ず戻せるようにしておく。
 */
data class UndoPrompt(
    val text: String,
    val undo: suspend () -> Unit,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val storageRepository: StorageRepository,
    private val foodItemRepository: FoodItemRepository,
    private val consumptionLogRepository: ConsumptionLogRepository,
    private val shoppingRepository: ShoppingRepository,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {

    /* 画面の見せ方だけの状態。端末の回転で失わないよう ViewModel が持つ */
    private val viewState = MutableStateFlow(ViewState())

    private data class ViewState(
        val tab: AppTab = AppTab.FRIDGE,
        val fridgeMode: FridgeMode = FridgeMode.FIGURE,
        val editingLayout: Boolean = false,
        val locationFilter: StorageLocation? = null,
    )

    private data class Stock(
        val layout: List<StorageUnitWithCompartments>,
        val items: List<FoodItemEntity>,
        val logs: List<ConsumptionLogEntity>,
    )

    private data class Side(
        val shopping: List<ShoppingItemEntity>,
        val recentNames: List<String>,
        val settings: AppSettings,
    )

    private val undoState = MutableStateFlow<UndoPrompt?>(null)
    val undo: StateFlow<UndoPrompt?> = undoState.asStateFlow()

    private val stock = combine(
        storageRepository.observeLayout(),
        foodItemRepository.observeAll(),
        consumptionLogRepository.observeAll(),
        ::Stock,
    )

    private val side = combine(
        shoppingRepository.observeAll(),
        foodItemRepository.observeRecentNames(),
        settingsRepository.settings,
        ::Side,
    )

    val uiState: StateFlow<HomeUiState> = combine(stock, side, viewState, ::build).stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState(),
    )

    init {
        viewModelScope.launch {
            storageRepository.seedIfEmpty(LocalDate.now())
            settingsRepository.ensureStartedAt(LocalDate.now())
        }
        /* 最長記録は捨てた瞬間に失われてしまうので、伸びるたびに書き留めておく */
        viewModelScope.launch {
            uiState.map { it.streak.toInt() }.distinctUntilChanged().collect { days ->
                settingsRepository.rememberBestStreak(days)
            }
        }
    }

    private fun build(stock: Stock, side: Side, view: ViewState): HomeUiState {
        val today = LocalDate.now()
        val locationByCompartment = stock.layout
            .flatMap { it.compartments }
            .associate { it.id to it.location }

        fun statusOf(item: FoodItemEntity): ExpiryStatus =
            item.expiryStatus(item.compartmentId?.let { locationByCompartment[it] }, today)

        val cards = stock.items.map { ItemCard(it, statusOf(it)) }
        val byCompartment = cards.groupBy { it.item.compartmentId }

        val units = stock.layout.map { unit ->
            UnitView(
                unit = unit.unit,
                compartments = unit.orderedCompartments.map { compartment ->
                    CompartmentView(compartment, byCompartment[compartment.id].orEmpty())
                },
            )
        }

        val known = locationByCompartment.keys
        val unplaced = cards.filter { it.item.compartmentId == null || it.item.compartmentId !in known }

        /* 期限が近い順。期限なしは末尾へ回す */
        val byExpiry = cards.sortedWith(
            compareBy<ItemCard> { it.status.date == null }
                .thenBy { it.status.date ?: today }
                .thenBy { it.item.name },
        )

        val streak = streakDays(stock.logs, side.settings.startedAt, today)

        return HomeUiState(
            today = today,
            tab = view.tab,
            fridgeMode = view.fridgeMode,
            editingLayout = view.editingLayout,
            locationFilter = view.locationFilter,
            units = units,
            unplaced = unplaced,
            byExpiry = byExpiry,
            urgent = byExpiry.filter { (it.status.daysLeft ?: Long.MAX_VALUE) <= ALERT_THRESHOLD_DAYS },
            totalCount = stock.items.size,
            streak = streak,
            bestStreak = maxOf(side.settings.bestStreak, streak.toInt()),
            logs = stock.logs,
            stats7 = consumptionStats(stock.logs, today.minusDays(6), today),
            stats30 = consumptionStats(stock.logs, today.minusDays(29), today),
            shopping = side.shopping,
            recentNames = side.recentNames,
            settings = side.settings,
        )
    }

    /* --- 画面の切り替え --------------------------------------------------- */

    fun selectTab(tab: AppTab) {
        viewState.value = viewState.value.copy(tab = tab, editingLayout = false)
    }

    fun setFridgeMode(mode: FridgeMode) {
        viewState.value = viewState.value.copy(fridgeMode = mode, editingLayout = false)
    }

    fun toggleLayoutEditing() {
        viewState.value = viewState.value.copy(editingLayout = !viewState.value.editingLayout)
    }

    fun setLocationFilter(location: StorageLocation?) {
        viewState.value = viewState.value.copy(locationFilter = location)
    }

    /* --- 食材 ------------------------------------------------------------- */

    fun move(itemId: Long, compartmentId: String?) = viewModelScope.launch {
        foodItemRepository.moveTo(itemId, compartmentId)
    }

    fun save(item: FoodItemEntity) = viewModelScope.launch {
        if (item.id == 0L) foodItemRepository.add(item) else foodItemRepository.update(item)
    }

    fun delete(item: FoodItemEntity) = viewModelScope.launch {
        foodItemRepository.delete(item)
    }

    /**
     * 名前だけで足す。カテゴリは名前から推し、期限は入れない。
     * 買ってきたものをまず放り込めるようにするための入口で、あとから直せる。
     */
    fun quickAdd(name: String) = viewModelScope.launch {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return@launch
        foodItemRepository.add(
            FoodItemEntity(
                id = 0L,
                name = trimmed,
                category = guessCategoryByName(trimmed),
                compartmentId = null,
                expiryType = ExpiryType.UNKNOWN,
                expiryDate = null,
                quantity = 1,
                registeredAt = LocalDate.now(),
                janCode = null,
                memo = null,
            ),
        )
    }

    /* --- 食べた・捨てた ----------------------------------------------------- */

    /** 一つ食べた。最後の一つなら在庫から消える */
    fun eatOne(item: FoodItemEntity) = viewModelScope.launch {
        val logId = log(item, ConsumptionType.EATEN, 1)
        if (item.quantity <= 1) {
            foodItemRepository.delete(item)
            offerUndo("「${item.name}」を食べきりました", logId) { foodItemRepository.add(item) }
        } else {
            foodItemRepository.update(item.copy(quantity = item.quantity - 1))
            offerUndo("「${item.name}」を1つ減らしました", logId) {
                foodItemRepository.update(item)
            }
        }
    }

    /** 食べきった。残りの数をまとめて記録して在庫から消す */
    fun eatAll(item: FoodItemEntity) = viewModelScope.launch {
        val logId = log(item, ConsumptionType.EATEN, item.quantity)
        foodItemRepository.delete(item)
        offerUndo("「${item.name}」を食べきりました", logId) { foodItemRepository.add(item) }
    }

    /**
     * 捨てた。ここが記録されると継続日数が0に戻る。
     * 数えるためだけの操作ではないので、戻せるようにしておく。
     */
    fun discard(item: FoodItemEntity) = viewModelScope.launch {
        val logId = log(item, ConsumptionType.DISCARDED, item.quantity)
        foodItemRepository.delete(item)
        offerUndo("「${item.name}」を捨てた記録を残しました", logId) { foodItemRepository.add(item) }
    }

    private suspend fun log(item: FoodItemEntity, type: ConsumptionType, quantity: Int): Long =
        consumptionLogRepository.record(
            ConsumptionLogEntity(
                name = item.name,
                category = item.category,
                type = type,
                quantity = quantity,
                date = LocalDate.now(),
            ),
        )

    /** 記録も在庫も元へ戻す。履歴だけ残ると継続日数が狂う */
    private fun offerUndo(text: String, logId: Long, restore: suspend () -> Unit) {
        undoState.value = UndoPrompt(text) {
            restore()
            consumptionLogRepository.deleteById(logId)
        }
    }

    fun runUndo(prompt: UndoPrompt) = viewModelScope.launch {
        prompt.undo()
        undoState.value = null
    }

    fun dismissUndo() {
        undoState.value = null
    }

    /* --- 買い物リスト ------------------------------------------------------- */

    fun addShopping(name: String) = viewModelScope.launch {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return@launch
        shoppingRepository.add(trimmed, uiState.value.shopping.size)
    }

    fun toggleShopping(item: ShoppingItemEntity) = viewModelScope.launch {
        shoppingRepository.update(item.copy(done = !item.done))
    }

    fun deleteShopping(item: ShoppingItemEntity) = viewModelScope.launch {
        shoppingRepository.delete(item)
    }

    fun clearDoneShopping() = viewModelScope.launch {
        shoppingRepository.clearDone()
    }

    /** 買ったものを在庫へ移す。買い物リストからは消える */
    fun stockUpShopping(item: ShoppingItemEntity) = viewModelScope.launch {
        quickAdd(item.name)
        shoppingRepository.delete(item)
    }

    /* --- 通知の設定 --------------------------------------------------------- */

    fun saveNotify(enabled: Boolean, time: LocalTime, daysBefore: Int) = viewModelScope.launch {
        settingsRepository.saveNotify(enabled, time, daysBefore)
    }

    /* --- 収納の編集 ------------------------------------------------------- */

    fun renameUnit(unit: StorageUnitEntity, name: String) = viewModelScope.launch {
        storageRepository.saveUnit(unit.copy(name = name.ifBlank { "名称未設定" }))
    }

    fun setUnitType(unit: StorageUnitEntity, type: StorageUnitType) = viewModelScope.launch {
        storageRepository.saveUnit(unit.copy(type = type))
    }

    fun setUnitColor(unit: StorageUnitEntity, colorArgb: Long?) = viewModelScope.launch {
        storageRepository.saveUnit(unit.copy(colorArgb = colorArgb))
    }

    fun addUnit() = viewModelScope.launch {
        val id = "unit-${UUID.randomUUID()}"
        storageRepository.saveUnit(
            StorageUnitEntity(id, "新しい収納", StorageUnitType.SHELF, null, uiState.value.units.size),
        )
        storageRepository.saveCompartment(
            CompartmentEntity(
                id = "c-${UUID.randomUUID()}",
                unitId = id,
                name = "棚",
                location = StorageLocation.ROOM_TEMP,
                form = CompartmentForm.SHELF,
                widthPercent = 100,
                heightDp = 68,
                colorArgb = null,
                sortOrder = 0,
            ),
        )
    }

    fun deleteUnit(unitId: String) = viewModelScope.launch {
        val view = uiState.value.units.find { it.unit.id == unitId } ?: return@launch
        storageRepository.deleteUnit(
            StorageUnitWithCompartments(view.unit, view.compartments.map { it.compartment }),
        )
    }

    fun saveCompartment(compartment: CompartmentEntity) = viewModelScope.launch {
        storageRepository.saveCompartment(compartment)
    }

    fun addCompartment(unitId: String) = viewModelScope.launch {
        val view = uiState.value.units.find { it.unit.id == unitId } ?: return@launch
        storageRepository.saveCompartment(
            CompartmentEntity(
                id = "c-${UUID.randomUUID()}",
                unitId = unitId,
                name = "新しい段",
                location = StorageLocation.FRIDGE,
                form = CompartmentForm.SHELF,
                widthPercent = 100,
                heightDp = 68,
                colorArgb = null,
                sortOrder = view.compartments.size,
            ),
        )
    }

    fun deleteCompartment(compartmentId: String) = viewModelScope.launch {
        storageRepository.deleteCompartment(compartmentId)
    }

    /** 上下の入れ替え。並び順は連番で振り直して隙間を残さない */
    fun moveCompartment(unitId: String, compartmentId: String, delta: Int) = viewModelScope.launch {
        val view = uiState.value.units.find { it.unit.id == unitId } ?: return@launch
        val ordered = view.compartments.map { it.compartment }.toMutableList()
        val from = ordered.indexOfFirst { it.id == compartmentId }
        val to = from + delta
        if (from < 0 || to !in ordered.indices) return@launch

        ordered.add(to, ordered.removeAt(from))
        storageRepository.saveCompartments(
            ordered.mapIndexed { index, compartment -> compartment.copy(sortOrder = index) },
        )
    }
}
