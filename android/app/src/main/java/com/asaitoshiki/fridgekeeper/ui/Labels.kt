package com.asaitoshiki.fridgekeeper.ui

import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryStatus
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType
import java.time.LocalDate

/* 表示名は画面側の関心なので domain の enum には持たせない */

val FoodCategory.label: String
    get() = when (this) {
        FoodCategory.VEGETABLE -> "野菜"
        FoodCategory.FRUIT -> "果物"
        FoodCategory.MEAT_FISH -> "肉・魚"
        FoodCategory.DAIRY -> "乳製品"
        FoodCategory.EGG -> "卵"
        FoodCategory.PROCESSED -> "加工食品"
        FoodCategory.FROZEN -> "冷凍食品"
        FoodCategory.SEASONING -> "調味料"
        FoodCategory.DRINK -> "飲料"
        FoodCategory.OTHER -> "その他"
    }

val StorageLocation.label: String
    get() = when (this) {
        StorageLocation.FRIDGE -> "冷蔵"
        StorageLocation.FREEZER -> "冷凍"
        StorageLocation.VEGETABLE_DRAWER -> "野菜室"
        StorageLocation.ROOM_TEMP -> "常温"
    }

val ExpiryType.label: String
    get() = when (this) {
        ExpiryType.BEST_BEFORE -> "賞味期限"
        ExpiryType.USE_BY -> "消費期限"
        ExpiryType.UNKNOWN -> "書いていない"
    }

val CompartmentForm.label: String
    get() = when (this) {
        CompartmentForm.SHELF -> "棚"
        CompartmentForm.DRAWER -> "引き出し"
        CompartmentForm.POCKET -> "ドアポケット"
    }

val StorageUnitType.label: String
    get() = when (this) {
        StorageUnitType.FRIDGE -> "冷蔵庫"
        StorageUnitType.SHELF -> "棚"
    }

/**
 * 残り日数の文言。
 * 「まだ食べられます」のように安全を断定する表現は使わない（仕様書8.2）。
 */
fun ExpiryStatus.remainingLabel(): String {
    val days = daysLeft ?: return "期限なし"
    return when {
        days < 0L -> "${-days}日超過"
        days == 0L -> "今日まで"
        else -> "あと${days}日"
    }
}

/** 図の中の小さなチップに収まる短い表記。負の数が過ぎた日数を表す */
fun ExpiryStatus.shortRemainingLabel(): String {
    val days = daysLeft ?: return "—"
    return when {
        days < 0L -> "-${-days}日"
        days == 0L -> "今日"
        else -> "${days}日"
    }
}

fun LocalDate.jp(): String = "${monthValue}月${dayOfMonth}日"
