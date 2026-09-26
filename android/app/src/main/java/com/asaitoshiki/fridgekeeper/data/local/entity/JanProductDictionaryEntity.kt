package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import java.time.LocalDate

/**
 * バーコード（JANコード）と商品名の対応辞書。
 *
 * 外部APIを使わない代わりに、ユーザーが一度手入力した商品名を端末内に蓄積し、
 * 次回以降のスキャン時の自動補完に使う。使うほど入力の手間が減っていく。
 *
 * defaultCategory が null なのは、商品名だけ登録されカテゴリが特定できていない状態を表す。
 */
@Entity(tableName = "jan_product_dictionary")
data class JanProductDictionaryEntity(
    @PrimaryKey
    val janCode: String,
    val productName: String,
    val defaultCategory: FoodCategory?,
    val lastUsedAt: LocalDate,
)
