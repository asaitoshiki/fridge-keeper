package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FoodItemDao {

    /**
     * 全件を購読する。
     * 期限順の並べ替えを SQL でやらないのは、期限未入力の食材の実効期限が
     * プリセット日数から domain 層で導出される値であり、SQL からは見えないため。
     * 一人分の冷蔵庫の在庫は高々数十件なので、取得後に domain 層で並べ替える。
     */
    @Query("SELECT * FROM food_items")
    fun observeAll(): Flow<List<FoodItemEntity>>

    /** 編集画面で使う。削除済みの食材を開こうとした場合は null になる */
    @Query("SELECT * FROM food_items WHERE id = :id")
    suspend fun findById(id: Long): FoodItemEntity?

    @Insert
    suspend fun insert(item: FoodItemEntity): Long

    @Update
    suspend fun update(item: FoodItemEntity)

    @Delete
    suspend fun delete(item: FoodItemEntity)
}
