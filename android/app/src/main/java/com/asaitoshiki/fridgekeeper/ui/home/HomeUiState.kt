package com.asaitoshiki.fridgekeeper.ui.home

import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.ShoppingItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.data.settings.AppSettings
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryStatus
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.stats.ConsumptionStats
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

/** 画面下部のタブ。冷蔵庫の中身を見る以外の役割をここで分ける */
enum class AppTab { FRIDGE, SHOPPING, NOTICES, REPORT, SETTINGS }

/** 冷蔵庫タブの中の見せ方。図で探すか、期限の近い順に並べて見るか */
enum class FridgeMode { FIGURE, EXPIRY }

data class HomeUiState(
    val today: LocalDate = LocalDate.now(),
    val tab: AppTab = AppTab.FRIDGE,
    val fridgeMode: FridgeMode = FridgeMode.FIGURE,
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
    /** 食品ロスなし継続日数と、これまでの最長 */
    val streak: Long = 0L,
    val bestStreak: Int = 0,
    val logs: List<ConsumptionLogEntity> = emptyList(),
    val stats7: ConsumptionStats = EMPTY_STATS,
    val stats30: ConsumptionStats = EMPTY_STATS,
    val shopping: List<ShoppingItemEntity> = emptyList(),
    /** 一押しで足せる「よく買うもの」 */
    val recentNames: List<String> = emptyList(),
    val settings: AppSettings = AppSettings(),
) {
    val filteredByExpiry: List<ItemCard>
        get() = locationFilter?.let { filter ->
            byExpiry.filter { locationOf(it.item) == filter }
        } ?: byExpiry

    /** 期限超過。お知らせタブで真っ先に出す */
    val expired: List<ItemCard> get() = byExpiry.filter { (it.status.daysLeft ?: 0L) < 0L }

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

private val EMPTY_STATS = ConsumptionStats(0, 0, null, emptyList())
