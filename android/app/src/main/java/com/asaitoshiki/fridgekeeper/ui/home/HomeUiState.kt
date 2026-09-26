package com.asaitoshiki.fridgekeeper.ui.home

import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryStatus
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import java.time.LocalDate

/** 食材ひとつと、そのときの期限の状態。画面はこれだけを見れば描ける */
data class ItemCard(
    val item: FoodItemEntity,
    val status: ExpiryStatus,
)

data class CompartmentView(
    val compartment: CompartmentEntity,
    val items: List<ItemCard>,
)

data class UnitView(
    val unit: StorageUnitEntity,
    val compartments: List<CompartmentView>,
)

enum class HomeTab { FRIDGE, EXPIRY }

data class HomeUiState(
    val today: LocalDate = LocalDate.now(),
    val tab: HomeTab = HomeTab.FRIDGE,
    val editingLayout: Boolean = false,
    val locationFilter: StorageLocation? = null,
    val units: List<UnitView> = emptyList(),
    /** 買ってきてまだどこにも入れていない食材 */
    val unplaced: List<ItemCard> = emptyList(),
    /** 期限が近い順。期限なしは末尾。これがアプリの心臓部 */
    val byExpiry: List<ItemCard> = emptyList(),
    /** 閾値日数以内に期限を迎える食材。開いた瞬間に伝えるためのもの */
    val urgent: List<ItemCard> = emptyList(),
    val totalCount: Int = 0,
) {
    val filteredByExpiry: List<ItemCard>
        get() = locationFilter?.let { filter ->
            byExpiry.filter { locationOf(it.item) == filter }
        } ?: byExpiry

    private val locationByCompartment: Map<String, StorageLocation> =
        units.flatMap { it.compartments }.associate { it.compartment.id to it.compartment.location }

    fun locationOf(item: FoodItemEntity): StorageLocation? =
        item.compartmentId?.let { locationByCompartment[it] }

    fun compartmentPath(compartmentId: String?): String {
        if (compartmentId == null) return "買ってきたもの"
        units.forEach { unitView ->
            unitView.compartments.forEach { view ->
                if (view.compartment.id == compartmentId) {
                    return "${unitView.unit.name} ${view.compartment.name}"
                }
            }
        }
        return "買ってきたもの"
    }

    fun countIn(location: StorageLocation): Int =
        byExpiry.count { locationOf(it.item) == location }
}
