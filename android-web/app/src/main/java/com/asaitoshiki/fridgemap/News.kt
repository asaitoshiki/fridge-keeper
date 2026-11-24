package com.asaitoshiki.fridgemap

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 開発者からのお知らせ。
 *
 * リポジトリの announcements.json を半日に一度ほど読み、まだ知らせていないものを通知にする。
 * アプリを開いていなくても届くように、ここで読む。こちらから送るものは何もない（読むだけ）。
 * アプリの中で読んだものは、ウェブ版が markSeen で教えてくれるので、通知を重ねて出さない。
 * 通知を許可していない人は、アプリのお知らせの画面で同じものを見られる。
 */
object News {
    private const val PREFS = "news"
    private const val KEY_SEEN = "seen"
    private const val KEY_ENABLED = "enabled"
    private const val CHANNEL = "news"
    const val ACTION_CHECK = "com.asaitoshiki.fridgemap.NEWS"
    const val URL_NEWS = "https://raw.githubusercontent.com/asaitoshiki/fridge-keeper/main/announcements.json"

    /* 入れたばかりの人に、昔のお知らせをまとめて鳴らさない。これより前の日付のものは通知にしない */
    private const val RECENT_DAYS = 7L

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun markSeen(context: Context, ids: List<String>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val seen = (prefs.getStringSet(KEY_SEEN, emptySet()) ?: emptySet()).toMutableSet()
        seen.addAll(ids)
        prefs.edit().putStringSet(KEY_SEEN, seen).apply()
    }

    /** 半日に一度ほど読みに行く目覚ましを掛ける。時刻は端末に任せる（電池にやさしい） */
    fun schedule(context: Context) {
        val intent = PendingIntent.getBroadcast(
            context, 1, Intent(context, NoticeReceiver::class.java).setAction(ACTION_CHECK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        context.getSystemService(AlarmManager::class.java).setInexactRepeating(
            AlarmManager.RTC,
            System.currentTimeMillis() + AlarmManager.INTERVAL_HOUR,
            AlarmManager.INTERVAL_HALF_DAY,
            intent,
        )
    }

    /** 読みに行き、まだ知らせていないお知らせを通知にする。通信があるので、呼ぶ側が別の流れで呼ぶ */
    fun check(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, true)) return
        val text = runCatching {
            val connection = URL(URL_NEWS).openConnection() as HttpURLConnection
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.useCaches = false
            try {
                if (connection.responseCode != 200) return
                connection.inputStream.bufferedReader().use { it.readText() }
            } finally {
                connection.disconnect()
            }
        }.getOrNull() ?: return
        val list = runCatching { JSONArray(text) }.getOrNull() ?: return
        val seen = (prefs.getStringSet(KEY_SEEN, emptySet()) ?: emptySet()).toMutableSet()
        val since = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(System.currentTimeMillis() - RECENT_DAYS * 24 * 60 * 60 * 1000))
        for (i in 0 until minOf(list.length(), 20)) {
            val news = list.optJSONObject(i) ?: continue
            val id = news.optString("id").take(40)
            val title = news.optString("title").take(80)
            if (id.isEmpty() || title.isEmpty() || id in seen) continue
            seen.add(id)
            val date = news.optString("date")
            if (date.isNotEmpty() && date < since) continue
            post(context, id, title, news.optString("body").take(800))
        }
        prefs.edit().putStringSet(KEY_SEEN, seen).apply()
    }

    private fun post(context: Context, id: String, title: String, body: String) {
        if (!Notices.allowed(context)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "開発者からのお知らせ", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val open = PendingIntent.getActivity(
            context, ("news" + id).hashCode(),
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(MainActivity.EXTRA_VIEW, "notices"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(("news" + id).hashCode(), notification) }
    }
}
