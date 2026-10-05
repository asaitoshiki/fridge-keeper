package com.asaitoshiki.fridgekeeper.data.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.time.LocalTime
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "fridge-keeper-settings")

/** 通知の設定と、継続日数の起点。仕様書6.6に合わせて DataStore に置く */
data class AppSettings(
    val notifyEnabled: Boolean = true,
    val notifyTime: LocalTime = LocalTime.of(8, 0),
    val notifyDaysBefore: Int = 3,
    val startedAt: LocalDate = LocalDate.now(),
    val bestStreak: Int = 0,
)

@Singleton
class SettingsRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val enabled = booleanPreferencesKey("notify_enabled")
        val time = stringPreferencesKey("notify_time")
        val daysBefore = intPreferencesKey("notify_days_before")
        val startedAt = stringPreferencesKey("started_at")
        val bestStreak = intPreferencesKey("best_streak")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            notifyEnabled = prefs[Keys.enabled] ?: true,
            notifyTime = prefs[Keys.time]?.let(LocalTime::parse) ?: LocalTime.of(8, 0),
            notifyDaysBefore = prefs[Keys.daysBefore] ?: 3,
            /* 起点が無いうちは今日。初回起動日からの日数として数え始める */
            startedAt = prefs[Keys.startedAt]?.let(LocalDate::parse) ?: LocalDate.now(),
            bestStreak = prefs[Keys.bestStreak] ?: 0,
        )
    }

    suspend fun saveNotify(enabled: Boolean, time: LocalTime, daysBefore: Int) {
        context.dataStore.edit { prefs ->
            prefs[Keys.enabled] = enabled
            prefs[Keys.time] = time.toString()
            prefs[Keys.daysBefore] = daysBefore.coerceIn(0, 14)
        }
    }

    /** 起点は一度だけ決める。あとから書き換えると継続日数が伸び縮みしてしまう */
    suspend fun ensureStartedAt(today: LocalDate) {
        context.dataStore.edit { prefs ->
            if (prefs[Keys.startedAt] == null) prefs[Keys.startedAt] = today.toString()
        }
    }

    suspend fun rememberBestStreak(days: Int) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.bestStreak] ?: 0
            if (days > current) prefs[Keys.bestStreak] = days
        }
    }
}
