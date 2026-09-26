package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.asaitoshiki.fridgekeeper.data.local.entity.JanProductDictionaryEntity

@Dao
interface JanProductDictionaryDao {

    /** 辞書に無いバーコードは必ず存在するため、ヒットしない場合は null を返す */
    @Query("SELECT * FROM jan_product_dictionary WHERE janCode = :janCode")
    suspend fun findByJanCode(janCode: String): JanProductDictionaryEntity?

    /** 同じ商品を再登録するたびに商品名と最終利用日を上書きしていく */
    @Upsert
    suspend fun upsert(entry: JanProductDictionaryEntity)
}
