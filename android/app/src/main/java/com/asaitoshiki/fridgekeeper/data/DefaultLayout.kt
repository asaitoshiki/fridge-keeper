package com.asaitoshiki.fridgekeeper.data

import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import java.time.LocalDate

/**
 * 初回起動時の収納。日本の家庭用冷蔵庫によくある構成に寄せてある。
 * ここから段を足したり形を変えたりするのはユーザーの自由。
 */
object DefaultLayout {

    const val UNIT_FRIDGE = "unit-fridge"
    const val UNIT_PANTRY = "unit-pantry"

    fun units(): List<StorageUnitEntity> = listOf(
        StorageUnitEntity(UNIT_FRIDGE, "冷蔵庫", StorageUnitType.FRIDGE, null, 0),
        StorageUnitEntity(UNIT_PANTRY, "常温の棚", StorageUnitType.SHELF, null, 1),
    )

    fun compartments(): List<CompartmentEntity> = listOf(
        comp("c-door", UNIT_FRIDGE, "ドアポケット", StorageLocation.FRIDGE, CompartmentForm.POCKET, 100, 52, 0),
        comp("c-upper", UNIT_FRIDGE, "上段", StorageLocation.FRIDGE, CompartmentForm.SHELF, 100, 68, 1),
        comp("c-middle", UNIT_FRIDGE, "中段", StorageLocation.FRIDGE, CompartmentForm.SHELF, 100, 68, 2),
        comp("c-chilled", UNIT_FRIDGE, "チルド室", StorageLocation.FRIDGE, CompartmentForm.DRAWER, 100, 52, 3),
        comp("c-ice", UNIT_FRIDGE, "製氷室", StorageLocation.FREEZER, CompartmentForm.DRAWER, 50, 52, 4),
        comp("c-freezer-s", UNIT_FRIDGE, "小さな冷凍室", StorageLocation.FREEZER, CompartmentForm.DRAWER, 50, 52, 5),
        comp("c-veg", UNIT_FRIDGE, "野菜室", StorageLocation.VEGETABLE_DRAWER, CompartmentForm.DRAWER, 100, 76, 6),
        comp("c-freezer", UNIT_FRIDGE, "冷凍室", StorageLocation.FREEZER, CompartmentForm.DRAWER, 100, 76, 7),
        comp("c-pantry", UNIT_PANTRY, "棚", StorageLocation.ROOM_TEMP, CompartmentForm.SHELF, 100, 72, 0),
    )

    /**
     * 初回起動で空の冷蔵庫を見せても何のアプリか伝わらないため、
     * 緊急度が一通り揃うサンプルを入れておく。設定からまとめて削除できる。
     * 期限は起動日からの相対で作る。
     */
    fun sampleItems(today: LocalDate): List<FoodItemEntity> = listOf(
        item("豚こま切れ肉", FoodCategory.MEAT_FISH, "c-chilled", ExpiryType.USE_BY, today, 1, today, "半額だったもの"),
        item("にんじん", FoodCategory.VEGETABLE, "c-veg", ExpiryType.UNKNOWN, null, 3, today.minusDays(9), null),
        item("絹ごし豆腐", FoodCategory.PROCESSED, "c-upper", ExpiryType.USE_BY, today.plusDays(1), 2, today, null),
        item("牛乳", FoodCategory.DAIRY, "c-door", ExpiryType.BEST_BEFORE, today.plusDays(2), 1, today, null),
        item("キャベツ", FoodCategory.VEGETABLE, "c-veg", ExpiryType.UNKNOWN, null, 1, today.minusDays(3), "半玉"),
        item("卵", FoodCategory.EGG, "c-middle", ExpiryType.BEST_BEFORE, today.plusDays(6), 8, today, null),
        item("冷凍うどん", FoodCategory.FROZEN, "c-freezer", ExpiryType.BEST_BEFORE, null, 4, today.minusDays(10), null),
        item("しょうゆ", FoodCategory.SEASONING, "c-pantry", ExpiryType.BEST_BEFORE, today.plusDays(210), 1, today, null),
        item("ヨーグルト", FoodCategory.DAIRY, null, ExpiryType.BEST_BEFORE, today.plusDays(9), 4, today, null),
    )

    private fun comp(
        id: String,
        unitId: String,
        name: String,
        location: StorageLocation,
        form: CompartmentForm,
        widthPercent: Int,
        heightDp: Int,
        sortOrder: Int,
    ) = CompartmentEntity(id, unitId, name, location, form, widthPercent, heightDp, null, sortOrder)

    private fun item(
        name: String,
        category: FoodCategory,
        compartmentId: String?,
        expiryType: ExpiryType,
        expiryDate: LocalDate?,
        quantity: Int,
        registeredAt: LocalDate,
        memo: String?,
    ) = FoodItemEntity(
        name = name,
        category = category,
        compartmentId = compartmentId,
        expiryType = expiryType,
        expiryDate = expiryDate,
        quantity = quantity,
        registeredAt = registeredAt,
        janCode = null,
        memo = memo,
    )
}
