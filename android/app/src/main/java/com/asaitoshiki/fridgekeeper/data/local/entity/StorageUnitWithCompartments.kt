package com.asaitoshiki.fridgekeeper.data.local.entity

import androidx.room.Embedded
import androidx.room.Relation

/** 筐体と、その中の段をまとめて取り出すための組。画面は常にこの形で受け取る */
data class StorageUnitWithCompartments(
    @Embedded val unit: StorageUnitEntity,
    @Relation(parentColumn = "id", entityColumn = "unitId")
    val compartments: List<CompartmentEntity>,
) {
    /** @Relation は並び順を保証しないので、取り出す側で整える */
    val orderedCompartments: List<CompartmentEntity>
        get() = compartments.sortedBy { it.sortOrder }
}
