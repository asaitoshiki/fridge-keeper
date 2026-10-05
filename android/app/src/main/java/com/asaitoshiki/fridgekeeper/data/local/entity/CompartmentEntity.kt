package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.asaitoshiki.fridgekeeper.domain.model.CompartmentForm
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation

/**
 * 筐体の中の段・引き出しひとつ分。
 *
 * location だけが期限の目安に効く。name・form・widthPercent・heightDp・colorArgb は
 * 見た目を決めるだけなので、段をいくつ作っても、形や色をどう変えても期限の計算は壊れない。
 *
 * widthPercent 幅の割合。合計が100を超えたところで次の行へ折り返す
 * heightDp     高さ
 * colorArgb    庫内の色。null なら既定の配色に従う
 */
@Entity(
    tableName = "compartments",
    foreignKeys = [
        ForeignKey(
            entity = StorageUnitEntity::class,
            parentColumns = ["id"],
            childColumns = ["unitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("unitId")],
)
data class CompartmentEntity(
    @PrimaryKey
    val id: String,
    val unitId: String,
    val name: String,
    val location: StorageLocation,
    val form: CompartmentForm,
    val widthPercent: Int,
    val heightDp: Int,
    val colorArgb: Long?,
    val sortOrder: Int,
)
