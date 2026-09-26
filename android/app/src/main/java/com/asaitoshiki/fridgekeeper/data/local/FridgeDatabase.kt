package com.asaitoshiki.fridgekeeper.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.asaitoshiki.fridgekeeper.data.local.dao.ConsumptionLogDao
import com.asaitoshiki.fridgekeeper.data.local.dao.FoodItemDao
import com.asaitoshiki.fridgekeeper.data.local.dao.FrequentItemTemplateDao
import com.asaitoshiki.fridgekeeper.data.local.dao.JanProductDictionaryDao
import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.FrequentItemTemplateEntity
import com.asaitoshiki.fridgekeeper.data.local.entity.JanProductDictionaryEntity

/** 端末内で完結する唯一のデータストア。サーバーとの同期は行わない */
@Database(
    entities = [
        FoodItemEntity::class,
        JanProductDictionaryEntity::class,
        ConsumptionLogEntity::class,
        FrequentItemTemplateEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(RoomConverters::class)
abstract class FridgeDatabase : RoomDatabase() {

    abstract fun foodItemDao(): FoodItemDao

    abstract fun janProductDictionaryDao(): JanProductDictionaryDao

    abstract fun consumptionLogDao(): ConsumptionLogDao

    abstract fun frequentItemTemplateDao(): FrequentItemTemplateDao

    companion object {
        const val NAME = "fridge-keeper.db"
    }
}
