package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.DefaultLayout
import com.asaitoshiki.fridgekeeper.data.local.dao.FoodItemDao
import com.asaitoshiki.fridgekeeper.data.local.dao.StorageDao
import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitWithCompartments
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/** 収納（筐体と段）の入出力口 */
@Singleton
class StorageRepository @Inject constructor(
    private val storageDao: StorageDao,
    private val foodItemDao: FoodItemDao,
) {
    fun observeLayout(): Flow<List<StorageUnitWithCompartments>> = storageDao.observeLayout()

    /** 初回起動のときだけ、既定の収納とサンプルを入れる */
    suspend fun seedIfEmpty(today: LocalDate) {
        if (storageDao.countUnits() > 0) return
        storageDao.insertUnits(DefaultLayout.units())
        storageDao.insertCompartments(DefaultLayout.compartments())
        if (foodItemDao.count() == 0) foodItemDao.insertAll(DefaultLayout.sampleItems(today))
    }

    suspend fun saveUnit(unit: StorageUnitEntity) = storageDao.upsertUnit(unit)

    suspend fun saveCompartment(compartment: CompartmentEntity) =
        storageDao.upsertCompartment(compartment)

    suspend fun saveCompartments(compartments: List<CompartmentEntity>) =
        storageDao.updateCompartments(compartments)

    /** 段を消す前に、中の食材を「買ってきたもの」へ戻す */
    suspend fun deleteCompartment(compartmentId: String) {
        foodItemDao.releaseFrom(listOf(compartmentId))
        storageDao.deleteCompartment(compartmentId)
    }

    suspend fun deleteUnit(unit: StorageUnitWithCompartments) {
        foodItemDao.releaseFrom(unit.compartments.map { it.id })
        storageDao.deleteUnit(unit.unit)
    }
}
