package com.asaitoshiki.fridgekeeper.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate

@Dao
interface ConsumptionLogDao {

    @Query("SELECT * FROM consumption_logs ORDER BY date DESC, id DESC")
    fun observeAll(): Flow<List<ConsumptionLogEntity>>

    /**
     * 指定した種別の最終記録日。DISCARDED を渡してストリークの起点を求める。
     * 一度も捨てていなければ null になり、その場合は利用開始日を起点にする。
     * 日付は ISO-8601 文字列で保存しているため MAX() が日付の最大値と一致する。
     */
    @Query("SELECT MAX(date) FROM consumption_logs WHERE type = :type")
    fun observeLatestDate(type: ConsumptionType): Flow<LocalDate?>

    @Insert
    suspend fun insert(log: ConsumptionLogEntity): Long

    /** Undo で消費・廃棄の記録を取り消すために使う */
    @Delete
    suspend fun delete(log: ConsumptionLogEntity)
}
