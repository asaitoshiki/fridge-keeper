package com.asaitoshiki.fridgekeeper.data.repository

import com.asaitoshiki.fridgekeeper.data.local.dao.ConsumptionLogDao
import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/** 食べた／捨てたの履歴の入出力口 */
@Singleton
class ConsumptionLogRepository @Inject constructor(
    private val consumptionLogDao: ConsumptionLogDao,
) {
    fun observeAll(): Flow<List<ConsumptionLogEntity>> = consumptionLogDao.observeAll()

    /** 最後に捨てた日。一度も捨てていなければ null */
    fun observeLastDiscardedDate(): Flow<LocalDate?> =
        consumptionLogDao.observeLatestDate(ConsumptionType.DISCARDED)

    suspend fun record(log: ConsumptionLogEntity): Long = consumptionLogDao.insert(log)

    suspend fun delete(log: ConsumptionLogEntity) = consumptionLogDao.delete(log)
}
