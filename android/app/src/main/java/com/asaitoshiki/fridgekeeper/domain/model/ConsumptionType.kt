package com.asaitoshiki.fridgekeeper.domain.model

/** 在庫から減らした理由。DISCARDED はストリークのリセット判定に使う */
enum class ConsumptionType {
    EATEN,
    DISCARDED,
}
