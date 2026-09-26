package com.asaitoshiki.fridgekeeper.domain.expiry

import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation

/**
 * 期限が印字されていない食材の日持ちの目安。カテゴリ × 保管場所で日数を引く。
 *
 * ここで返す日数はあくまで一般的な目安であり、実際の安全性を保証するものではない。
 * この値から導出した期限を表示する箇所には必ず「目安」バッジを付けること。
 *
 * v1.0 ではハードコードとする（ユーザー編集は v1.1）。
 */
object PresetExpiryTable {

    private val presetDays: Map<FoodCategory, Map<StorageLocation, Int>> = mapOf(
        FoodCategory.VEGETABLE to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.FREEZER to 30,
            StorageLocation.VEGETABLE_DRAWER to 7,
            StorageLocation.ROOM_TEMP to 5,
        ),
        FoodCategory.FRUIT to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.FREEZER to 30,
            StorageLocation.VEGETABLE_DRAWER to 7,
            StorageLocation.ROOM_TEMP to 5,
        ),
        FoodCategory.MEAT_FISH to mapOf(
            StorageLocation.FRIDGE to 2,
            StorageLocation.FREEZER to 30,
        ),
        FoodCategory.DAIRY to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.FREEZER to 14,
        ),
        FoodCategory.EGG to mapOf(
            StorageLocation.FRIDGE to 14,
            StorageLocation.ROOM_TEMP to 7,
        ),
        FoodCategory.PROCESSED to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.FREEZER to 30,
            StorageLocation.ROOM_TEMP to 30,
        ),
        FoodCategory.FROZEN to mapOf(
            StorageLocation.FREEZER to 90,
        ),
        FoodCategory.SEASONING to mapOf(
            StorageLocation.FRIDGE to 90,
            StorageLocation.ROOM_TEMP to 90,
        ),
        FoodCategory.DRINK to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.ROOM_TEMP to 30,
        ),
        FoodCategory.OTHER to mapOf(
            StorageLocation.FRIDGE to 7,
            StorageLocation.FREEZER to 30,
            StorageLocation.VEGETABLE_DRAWER to 7,
            StorageLocation.ROOM_TEMP to 7,
        ),
    )

    /**
     * 日持ちの目安日数を返す。
     * 未定義の組み合わせ（例：肉・魚を野菜室）では null を返し、呼び出し側は期限なし扱いとする。
     * この null は不正な状態ではなく「目安を出せない」という正常な業務状態である。
     */
    fun daysFor(category: FoodCategory, storageLocation: StorageLocation): Int? =
        presetDays.getValue(category)[storageLocation]
}
