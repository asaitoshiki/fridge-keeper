package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation

/** よく買うもののテンプレート。ワンタップ登録で入力の手間を削るための下敷き */
@Entity(tableName = "frequent_item_templates")
data class FrequentItemTemplateEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val category: FoodCategory,
    val storageLocation: StorageLocation,
    val expiryType: ExpiryType,
    val defaultQuantity: Int,
    val sortOrder: Int,
)
