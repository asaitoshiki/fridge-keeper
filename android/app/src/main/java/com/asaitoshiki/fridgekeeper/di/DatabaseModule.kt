package com.asaitoshiki.fridgekeeper.di

import android.content.Context
import androidx.room.Room
import com.asaitoshiki.fridgekeeper.data.local.FridgeDatabase
import com.asaitoshiki.fridgekeeper.data.local.dao.ConsumptionLogDao
import com.asaitoshiki.fridgekeeper.data.local.dao.FoodItemDao
import com.asaitoshiki.fridgekeeper.data.local.dao.JanProductDictionaryDao
import com.asaitoshiki.fridgekeeper.data.local.dao.ShoppingDao
import com.asaitoshiki.fridgekeeper.data.local.dao.StorageDao
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
        Room.databaseBuilder(context, FridgeDatabase::class.java, FridgeDatabase.NAME)
            /* まだ誰にも配っていない開発中の版なので、作り直して構わない */
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideStorageDao(database: FridgeDatabase): StorageDao = database.storageDao()

    @Provides
    fun provideFoodItemDao(database: FridgeDatabase): FoodItemDao = database.foodItemDao()

    @Provides
    fun provideJanProductDictionaryDao(database: FridgeDatabase): JanProductDictionaryDao =
        database.janProductDictionaryDao()

    @Provides
    fun provideConsumptionLogDao(database: FridgeDatabase): ConsumptionLogDao =
        database.consumptionLogDao()

    @Provides
    fun provideShoppingDao(database: FridgeDatabase): ShoppingDao = database.shoppingDao()
}
