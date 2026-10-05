package com.asaitoshiki.fridgekeeper.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitWithCompartments
import com.asaitoshiki.fridgekeeper.data.repository.FoodItemRepository
import com.asaitoshiki.fridgekeeper.data.repository.StorageRepository
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryStatus
import com.asaitoshiki.fridgekeeper.domain.expiry.expiryStatus
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

/** 何日前から「使い切りたい」として扱うか。仕様書6.6の既定値 */
private const val ALERT_THRESHOLD_DAYS = 3L

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val storageRepository: StorageRepository,
    private val foodItemRepository: FoodItemRepository,
) : ViewModel() {

    /* 画面の見せ方だけの状態。端末の回転で失わないよう ViewModel が持つ */
    private val viewState = MutableStateFlow(ViewState())

    private data class ViewState(
        val tab: HomeTab = HomeTab.FRIDGE,
        val editingLayout: Boolean = false,
        val locationFilter: StorageLocation? = null,
    )

    val uiState: StateFlow<HomeUiState> = combine(
        storageRepository.observeLayout(),
        foodItemRepository.observeAll(),
        viewState,
    ) { layout, items, view ->
        build(layout, items, view)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState(),
    )

    init {
        viewModelScope.launch { storageRepository.seedIfEmpty(LocalDate.now()) }
    }

    private fun build(
        layout: List<StorageUnitWithCompartments>,
        items: List<FoodItemEntity>,
        view: ViewState,
    ): HomeUiState {
        val today = LocalDate.now()
        val locationByCompartment = layout
            .flatMap { it.compartments }
            .associate { it.id to it.location }

        fun statusOf(item: FoodItemEntity): ExpiryStatus =
            item.expiryStatus(item.compartmentId?.let { locationByCompartment[it] }, today)

        val cards = items.map { ItemCard(it, statusOf(it)) }
        val byCompartment = cards.groupBy { it.item.compartmentId }

        val units = layout.map { unit ->
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

        return HomeUiState(
            today = today,
            tab = view.tab,
            editingLayout = view.editingLayout,
            locationFilter = view.locationFilter,
            units = units,
            unplaced = unplaced,
            byExpiry = byExpiry,
            urgent = byExpiry.filter { (it.status.daysLeft ?: Long.MAX_VALUE) <= ALERT_THRESHOLD_DAYS },
            totalCount = items.size,
        )
    }

    /* --- 画面の切り替え --------------------------------------------------- */

    fun selectTab(tab: HomeTab) {
        viewState.value = viewState.value.copy(tab = tab, editingLayout = false)
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

    /* --- 収納の編集 ------------------------------------------------------- */

    fun renameUnit(unit: StorageUnitEntity, name: String) = viewModelScope.launch {
        storageRepository.saveUnit(unit.copy(name = name.ifBlank { "名称未設定" }))
    }

    fun setUnitType(unit: StorageUnitEntity, type: StorageUnitType) = viewModelScope.launch {
        storageRepository.saveUnit(unit.copy(type = type))
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
