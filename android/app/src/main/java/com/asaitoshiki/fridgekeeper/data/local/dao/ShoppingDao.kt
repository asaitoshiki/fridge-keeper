package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.asaitoshiki.fridgekeeper.data.local.entity.ShoppingItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ShoppingDao {

    @Query("SELECT * FROM shopping_items ORDER BY sortOrder ASC, id ASC")
    fun observeAll(): Flow<List<ShoppingItemEntity>>

    @Insert
    suspend fun insert(item: ShoppingItemEntity): Long

    @Update
    suspend fun update(item: ShoppingItemEntity)

    @Delete
    suspend fun delete(item: ShoppingItemEntity)

    @Query("DELETE FROM shopping_items WHERE done = 1")
    suspend fun deleteDone()
}
