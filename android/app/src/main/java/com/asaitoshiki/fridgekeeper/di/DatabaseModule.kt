package com.asaitoshiki.fridgekeeper.di

import android.content.Context
import androidx.room.Room
import com.asaitoshiki.fridgekeeper.data.local.FridgeDatabase
import com.asaitoshiki.fridgekeeper.data.local.dao.ConsumptionLogDao
import com.asaitoshiki.fridgekeeper.data.local.dao.FoodItemDao
import com.asaitoshiki.fridgekeeper.data.local.dao.FrequentItemTemplateDao
import com.asaitoshiki.fridgekeeper.data.local.dao.JanProductDictionaryDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideFridgeDatabase(@ApplicationContext context: Context): FridgeDatabase =
        Room.databaseBuilder(context, FridgeDatabase::class.java, FridgeDatabase.NAME).build()

    @Provides
    fun provideFoodItemDao(database: FridgeDatabase): FoodItemDao = database.foodItemDao()

    @Provides
    fun provideJanProductDictionaryDao(database: FridgeDatabase): JanProductDictionaryDao =
        database.janProductDictionaryDao()

    @Provides
    fun provideConsumptionLogDao(database: FridgeDatabase): ConsumptionLogDao =
        database.consumptionLogDao()

    @Provides
    fun provideFrequentItemTemplateDao(database: FridgeDatabase): FrequentItemTemplateDao =
        database.frequentItemTemplateDao()
}
