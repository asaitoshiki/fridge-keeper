package com.asaitoshiki.fridgekeeper.domain.model

/** 保管場所。同じ食材でも保管場所で日持ちが大きく変わるためカテゴリと組で期限を決める */
enum class StorageLocation {
    FRIDGE,
    FREEZER,
    VEGETABLE_DRAWER,
    ROOM_TEMP,
}
