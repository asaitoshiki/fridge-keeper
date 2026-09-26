package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.local.dao.JanProductDictionaryDao
import com.asaitoshiki.fridgekeeper.data.local.entity.JanProductDictionaryEntity
import javax.inject.Inject
import javax.inject.Singleton

/** バーコード辞書の入出力口。端末内に閉じており外部の商品DBは参照しない */
@Singleton
class JanProductDictionaryRepository @Inject constructor(
    private val janProductDictionaryDao: JanProductDictionaryDao,
) {
    suspend fun findByJanCode(janCode: String): JanProductDictionaryEntity? =
        janProductDictionaryDao.findByJanCode(janCode)

    suspend fun remember(entry: JanProductDictionaryEntity) =
        janProductDictionaryDao.upsert(entry)
}
