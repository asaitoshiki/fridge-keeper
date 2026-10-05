package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.local.dao.ShoppingDao
import com.asaitoshiki.fridgekeeper.data.local.entity.ShoppingItemEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/** 買い物リストの入出力口 */
@Singleton
class ShoppingRepository @Inject constructor(
    private val shoppingDao: ShoppingDao,
) {
    fun observeAll(): Flow<List<ShoppingItemEntity>> = shoppingDao.observeAll()

    suspend fun add(name: String, sortOrder: Int) =
        shoppingDao.insert(ShoppingItemEntity(name = name, done = false, sortOrder = sortOrder))

    suspend fun update(item: ShoppingItemEntity) = shoppingDao.update(item)

    suspend fun delete(item: ShoppingItemEntity) = shoppingDao.delete(item)

    suspend fun clearDone() = shoppingDao.deleteDone()
}
