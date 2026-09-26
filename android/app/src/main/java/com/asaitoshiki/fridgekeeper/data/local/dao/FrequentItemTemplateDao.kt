package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.asaitoshiki.fridgekeeper.data.local.entity.FrequentItemTemplateEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FrequentItemTemplateDao {

    /** ユーザーが決めた並び順で出す。よく使うものほど上に置けるようにするため */
    @Query("SELECT * FROM frequent_item_templates ORDER BY sortOrder ASC, id ASC")
    fun observeAll(): Flow<List<FrequentItemTemplateEntity>>

    @Insert
    suspend fun insert(template: FrequentItemTemplateEntity): Long

    @Update
    suspend fun update(template: FrequentItemTemplateEntity)

    @Delete
    suspend fun delete(template: FrequentItemTemplateEntity)
}
