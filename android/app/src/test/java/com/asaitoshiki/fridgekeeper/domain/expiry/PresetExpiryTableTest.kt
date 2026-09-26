package com.asaitoshiki.fridgekeeper.domain.expiry

import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PresetExpiryTableTest {

    /** 仕様書のプリセット期限テーブルをそのまま突き合わせる。「–」のセルは null */
    @Test
    fun `仕様書のテーブルどおりの日数を返す`() {
        val expected: Map<FoodCategory, Map<StorageLocation, Int?>> = mapOf(
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
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to null,
            ),
            FoodCategory.DAIRY to mapOf(
                StorageLocation.FRIDGE to 7,
                StorageLocation.FREEZER to 14,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to null,
            ),
            FoodCategory.EGG to mapOf(
                StorageLocation.FRIDGE to 14,
                StorageLocation.FREEZER to null,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to 7,
            ),
            FoodCategory.PROCESSED to mapOf(
                StorageLocation.FRIDGE to 7,
                StorageLocation.FREEZER to 30,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to 30,
            ),
            FoodCategory.FROZEN to mapOf(
                StorageLocation.FRIDGE to null,
                StorageLocation.FREEZER to 90,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to null,
            ),
            FoodCategory.SEASONING to mapOf(
                StorageLocation.FRIDGE to 90,
                StorageLocation.FREEZER to null,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to 90,
            ),
            FoodCategory.DRINK to mapOf(
                StorageLocation.FRIDGE to 7,
                StorageLocation.FREEZER to null,
                StorageLocation.VEGETABLE_DRAWER to null,
                StorageLocation.ROOM_TEMP to 30,
            ),
            FoodCategory.OTHER to mapOf(
                StorageLocation.FRIDGE to 7,
                StorageLocation.FREEZER to 30,
                StorageLocation.VEGETABLE_DRAWER to 7,
                StorageLocation.ROOM_TEMP to 7,
            ),
        )

        expected.forEach { (category, perLocation) ->
            perLocation.forEach { (location, days) ->
                assertEquals(
                    "$category × $location",
                    days,
                    PresetExpiryTable.daysFor(category, location),
                )
            }
        }
    }

    /** 未定義の組み合わせは期限なし扱い。ここで例外を投げてはならない */
    @Test
    fun `未定義の組み合わせは null を返す`() {
        assertNull(PresetExpiryTable.daysFor(FoodCategory.MEAT_FISH, StorageLocation.ROOM_TEMP))
        assertNull(PresetExpiryTable.daysFor(FoodCategory.FROZEN, StorageLocation.FRIDGE))
    }

    /** カテゴリを追加したときに定義漏れを検知する（内部で getValue しているため落ちる） */
    @Test
    fun `全てのカテゴリと保管場所の組み合わせを引ける`() {
        FoodCategory.entries.forEach { category ->
            StorageLocation.entries.forEach { location ->
                PresetExpiryTable.daysFor(category, location)
            }
        }
    }
}
