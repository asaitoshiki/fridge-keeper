package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 買い物リストの一行。
 * 家族への共有は OS の共有シートへ投げるだけなので、送り先はここに持たない。
 */
@Entity(tableName = "shopping_items")
data class ShoppingItemEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val done: Boolean,
    val sortOrder: Int,
)
