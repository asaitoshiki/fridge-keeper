package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import java.time.LocalDate

/**
 * 冷蔵庫にある食材ひとつ分。
 *
 * expiryDate が null 許容なのは、野菜・肉・魚など期限が印字されていない食品が現実に存在するため。
 * 「期限が未設定」はエラーではなく正常な業務状態であり、登録時に入力を必須にしてはならない。
 * null のときの実効期限は domain 層でプリセット日数から導出する（DBには保存しない）。
 *
 * compartmentId が null なのは、買ってきてまだどこにも入れていない状態。
 * この場合は収納の種類が決まらないので期限の目安も出さない。
 */
@Entity(tableName = "food_items", indices = [Index("compartmentId")])
data class FoodItemEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val category: FoodCategory,
    val compartmentId: String?,
    val expiryType: ExpiryType,
    val expiryDate: LocalDate?,
    val quantity: Int,
    val registeredAt: LocalDate,
    val janCode: String?,
    val memo: String?,
)
