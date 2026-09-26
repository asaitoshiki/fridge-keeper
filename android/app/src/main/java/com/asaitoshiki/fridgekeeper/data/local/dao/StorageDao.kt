package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import com.asaitoshiki.fridgekeeper.data.local.entity.CompartmentEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.StorageUnitWithCompartments
import kotlinx.coroutines.flow.Flow

@Dao
interface StorageDao {

    @Transaction
    @Query("SELECT * FROM storage_units ORDER BY sortOrder ASC")
    fun observeLayout(): Flow<List<StorageUnitWithCompartments>>

    @Query("SELECT COUNT(*) FROM storage_units")
    suspend fun countUnits(): Int

    @Insert
    suspend fun insertUnits(units: List<StorageUnitEntity>)

    @Insert
    suspend fun insertCompartments(compartments: List<CompartmentEntity>)

    @Upsert
    suspend fun upsertUnit(unit: StorageUnitEntity)

    @Upsert
    suspend fun upsertCompartment(compartment: CompartmentEntity)

    @Update
    suspend fun updateCompartments(compartments: List<CompartmentEntity>)

    @Delete
    suspend fun deleteUnit(unit: StorageUnitEntity)

    @Query("DELETE FROM compartments WHERE id = :compartmentId")
    suspend fun deleteCompartment(compartmentId: String)
}
