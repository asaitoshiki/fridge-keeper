package com.asaitoshiki.fridgekeeper.domain.model

/**
 * 期限の種別。
 * 消費期限(USE_BY)は過ぎたら食べてはいけないため、賞味期限(BEST_BEFORE)より強い警告表示に使う。
 * 安全上の理由から両者を混同してはならない。
 */
enum class ExpiryType {
    BEST_BEFORE,
    USE_BY,
    UNKNOWN,
}
