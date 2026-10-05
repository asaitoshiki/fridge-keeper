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

    /** よく買うもの。あとに登録したものほど前に出す */
    @Query("SELECT name FROM food_items GROUP BY name ORDER BY MAX(id) DESC LIMIT 8")
    fun observeRecentNames(): Flow<List<String>>

    @Query("SELECT COUNT(*) FROM food_items")
    suspend fun count(): Int

    @Insert
    suspend fun insert(item: FoodItemEntity): Long

    @Insert
    suspend fun insertAll(items: List<FoodItemEntity>)

    @Update
    suspend fun update(item: FoodItemEntity)

    @Delete
    suspend fun delete(item: FoodItemEntity)

    /** 段を消したときに、中の食材を「買ってきたもの」へ戻す */
    @Query("UPDATE food_items SET compartmentId = NULL WHERE compartmentId IN (:compartmentIds)")
    suspend fun releaseFrom(compartmentIds: List<String>)

    @Query("UPDATE food_items SET compartmentId = :compartmentId WHERE id = :itemId")
    suspend fun moveTo(itemId: Long, compartmentId: String?)
}
