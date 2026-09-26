package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.local.dao.FoodItemDao
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/** 食材在庫の入出力口。ViewModel から Room を直接触らせないための薄い層 */
@Singleton
class FoodItemRepository @Inject constructor(
    private val foodItemDao: FoodItemDao,
) {
    fun observeAll(): Flow<List<FoodItemEntity>> = foodItemDao.observeAll()

    suspend fun add(item: FoodItemEntity): Long = foodItemDao.insert(item)

    suspend fun update(item: FoodItemEntity) = foodItemDao.update(item)

    suspend fun delete(item: FoodItemEntity) = foodItemDao.delete(item)

    /** 収納を移す。期限を入力していない食材は、移した先に応じて目安も変わる */
    suspend fun moveTo(itemId: Long, compartmentId: String?) =
        foodItemDao.moveTo(itemId, compartmentId)
}
