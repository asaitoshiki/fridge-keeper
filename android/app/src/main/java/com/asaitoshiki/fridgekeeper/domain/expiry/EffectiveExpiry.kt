package com.asaitoshiki.fridgekeeper.domain.expiry

import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * 実効期限。date が null なら期限なし扱い（アラート対象外）。
 * estimated はプリセット日数から導いたことを表し、UI では必ず「目安」バッジを出す。
 */
data class EffectiveExpiry(
    val date: LocalDate?,
    val estimated: Boolean,
)

/**
 * 実効期限 = 入力された期限、なければ 登録日 + プリセット日数。
 * 推定値は保存せず参照のたびに導出する。収納を移せば目安も変わる。
 *
 * location が null なのは、まだどこにも入れていない食材。目安は出さない。
 */
fun FoodItemEntity.effectiveExpiry(location: StorageLocation?): EffectiveExpiry {
    expiryDate?.let { return EffectiveExpiry(it, estimated = false) }

    val days = PresetExpiryTable.daysFor(category, location)
        ?: return EffectiveExpiry(null, estimated = true)
    return EffectiveExpiry(registeredAt.plusDays(days.toLong()), estimated = true)
}

/** 期限の緊急度。仕様書6.1の色分けに対応する */
enum class ExpiryUrgency {
    EXPIRED,
    CRITICAL,
    WARN,
    CAUTION,
    NORMAL,
    NONE,
}

/** 残り日数と緊急度をまとめたもの。画面はこれだけを見れば描ける */
data class ExpiryStatus(
    val urgency: ExpiryUrgency,
    val daysLeft: Long?,
    val date: LocalDate?,
    val estimated: Boolean,
)

fun FoodItemEntity.expiryStatus(location: StorageLocation?, today: LocalDate): ExpiryStatus {
    val effective = effectiveExpiry(location)
    val date = effective.date
        ?: return ExpiryStatus(ExpiryUrgency.NONE, null, null, effective.estimated)

    val daysLeft = ChronoUnit.DAYS.between(today, date)
    return ExpiryStatus(urgencyForDays(daysLeft), daysLeft, date, effective.estimated)
}

private fun urgencyForDays(daysLeft: Long): ExpiryUrgency = when {
    daysLeft < 0 -> ExpiryUrgency.EXPIRED
    daysLeft <= 1 -> ExpiryUrgency.CRITICAL
    daysLeft <= 3 -> ExpiryUrgency.WARN
    daysLeft <= 7 -> ExpiryUrgency.CAUTION
    else -> ExpiryUrgency.NORMAL
}
