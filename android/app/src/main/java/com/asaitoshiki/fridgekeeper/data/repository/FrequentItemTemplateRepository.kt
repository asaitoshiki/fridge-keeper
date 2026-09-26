package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.local.dao.FrequentItemTemplateDao
import com.asaitoshiki.fridgekeeper.data.local.entity.FrequentItemTemplateEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/** よく買うものテンプレートの入出力口 */
@Singleton
class FrequentItemTemplateRepository @Inject constructor(
    private val frequentItemTemplateDao: FrequentItemTemplateDao,
) {
    fun observeAll(): Flow<List<FrequentItemTemplateEntity>> =
        frequentItemTemplateDao.observeAll()

    suspend fun add(template: FrequentItemTemplateEntity): Long =
        frequentItemTemplateDao.insert(template)

    suspend fun update(template: FrequentItemTemplateEntity) =
        frequentItemTemplateDao.update(template)

    suspend fun delete(template: FrequentItemTemplateEntity) =
        frequentItemTemplateDao.delete(template)
}
