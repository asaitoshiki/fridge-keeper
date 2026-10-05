package com.asaitoshiki.fridgekeeper.domain.stats

import com.asaitoshiki.fridgekeeper.data.local.entity.ConsumptionLogEntity
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * 食品ロスなし継続日数。
 * 最後に「捨てた」を記録した日から今日まで。一度も捨てていなければ利用開始日から。
 * 捨てた記録が入るとここが0に戻る。このアプリの世界観の中心にある数字。
 */
fun streakDays(logs: List<ConsumptionLogEntity>, startedAt: LocalDate, today: LocalDate): Long {
    val lastDiscarded = logs
        .filter { it.type == ConsumptionType.DISCARDED }
        .maxOfOrNull { it.date }
    val from = lastDiscarded ?: startedAt
    return ChronoUnit.DAYS.between(from, today).coerceAtLeast(0L)
}

data class CategoryCount(val category: FoodCategory, val count: Int)

/**
 * 期間内の実績。
 * 食べきり率は、減らした総数のうち食べた分の割合。記録が無い間は null にして、
 * 呼び出し側で「まだ出せない」と伝える。0% と書くと全部捨てたように見えてしまう。
 */
data class ConsumptionStats(
    val eaten: Int,
    val discarded: Int,
    val rate: Float?,
    val discardedByCategory: List<CategoryCount>,
) {
    val total: Int get() = eaten + discarded
}

fun consumptionStats(
    logs: List<ConsumptionLogEntity>,
    from: LocalDate,
    to: LocalDate,
): ConsumptionStats {
    val inRange = logs.filter { !it.date.isBefore(from) && !it.date.isAfter(to) }
    val eaten = inRange.filter { it.type == ConsumptionType.EATEN }.sumOf { it.quantity }
    val discarded = inRange.filter { it.type == ConsumptionType.DISCARDED }.sumOf { it.quantity }
    val total = eaten + discarded

    val byCategory = inRange
        .filter { it.type == ConsumptionType.DISCARDED }
        .groupBy { it.category }
        .map { (category, entries) -> CategoryCount(category, entries.sumOf { it.quantity }) }
        .sortedByDescending { it.count }

    return ConsumptionStats(
        eaten = eaten,
        discarded = discarded,
        rate = if (total > 0) eaten.toFloat() / total else null,
        discardedByCategory = byCategory,
    )
}
