package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import java.time.LocalDate

/**
 * 食べた／捨てたの履歴。食材を消したあとも残るため、食材本体とは独立したテーブルにする。
 * ストリーク（食品ロスなし継続日数）と統計の算出元になる。
 */
@Entity(tableName = "consumption_logs")
data class ConsumptionLogEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val category: FoodCategory,
    val type: ConsumptionType,
    val quantity: Int,
    val date: LocalDate,
)
