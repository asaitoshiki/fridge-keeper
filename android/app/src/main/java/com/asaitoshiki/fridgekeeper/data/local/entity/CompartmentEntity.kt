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
 * location だけが期限の目安に効く。name・form・span・size は見た目を決めるだけなので、
 * ユーザーが段をいくつ作っても、形をどう変えても期限の計算は壊れない。
 *
 * span 2=全幅 / 1=半分（隣の半幅の段と横に並ぶ）
 * size 1..4 の高さ
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
    val span: Int,
    val size: Int,
    val sortOrder: Int,
)
