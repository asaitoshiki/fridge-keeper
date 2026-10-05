package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.StorageUnitType

/** 冷蔵庫や棚といった筐体ひとつ分。colorArgb が null なら既定の配色に従う */
@Entity(tableName = "storage_units")
data class StorageUnitEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val type: StorageUnitType,
    val colorArgb: Long?,
    val sortOrder: Int,
)
