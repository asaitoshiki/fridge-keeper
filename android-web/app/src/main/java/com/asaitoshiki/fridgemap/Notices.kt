package com.asaitoshiki.fridgemap

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * 期限のお知らせ。
 *
 * いつ何を知らせるかはウェブ版が決め、保存のたびに並び（[{at, title, body}]、at は端末の時計のミリ秒）を渡してくる。
 * ここではそれを控えておき、いちばん近いものに目覚ましを掛けるだけ。鳴ったら出して、次に掛け直す。
 * アプリを開かない日が続いても鳴るよう、先の分までまとめて受け取っておく。
 *
 * 正確な時刻の目覚ましは特別な許可が要るので使わない。数分ずれることはあるが、
 * 通知は届かないこともある前提で作ってあり、アプリを開けば必ず状況が分かる。
 */
object Notices {
    private const val PREFS = "notices"
    private const val KEY_LIST = "list"
    private const val CHANNEL = "expiry"

    /* 端末の電源が切れていたなどで遅れたものは、この時間までなら出す。それより古いものは今さら知らせない */
    private const val LATE_LIMIT_MS = 12L * 60 * 60 * 1000

    fun save(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LIST, json).apply()
        scheduleNext(context)
    }

    /** 時刻が来たものを出し、残りの中でいちばん近いものに目覚ましを掛け直す */
    fun fire(context: Context) {
        val now = System.currentTimeMillis()
        val all = load(context)
        val due = all.filter { it.optLong("at") <= now + 60_000 }
        due.filter { it.optLong("at") > now - LATE_LIMIT_MS }.forEach { post(context, it) }
        val rest = JSONArray()
        all.filter { it !in due }.forEach { rest.put(it) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LIST, rest.toString()).apply()
        scheduleNext(context)
    }

    fun scheduleNext(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val intent = PendingIntent.getBroadcast(
            context, 0, Intent(context, NoticeReceiver::class.java).setAction(ACTION_FIRE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val next = load(context).minOfOrNull { it.optLong("at") }
        if (next == null) {
            alarms.cancel(intent)
            return
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, intent)
    }

    /** 通知を出してよいか。Android 13 からは、その人に許可をもらわないと出せない */
    fun allowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun load(context: Context): List<JSONObject> {
        val text = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LIST, null) ?: return emptyList()
        val array = runCatching { JSONArray(text) }.getOrElse { return emptyList() }
        return (0 until array.length()).map { array.getJSONObject(it) }
    }

    private fun post(context: Context, notice: JSONObject) {
        if (!allowed(context)) return
        /* 通知の種類（チャンネル）は Android 8 から。それより前は無くても出せる */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "期限のお知らせ", NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val body = notice.optString("body")
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(notice.optString("title"))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        /* 同じ時刻の知らせは一つにまとめて渡ってくるので、時刻（分）を番号にする */
        val id = (notice.optLong("at") / 60_000 % Int.MAX_VALUE).toInt()
        runCatching { NotificationManagerCompat.from(context).notify(id, notification) }
    }

    const val ACTION_FIRE = "com.asaitoshiki.fridgemap.NOTICE"
}

/** 目覚ましが鳴ったとき、端末を入れ直したとき、アプリを入れ直したときに呼ばれる */
class NoticeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        /* 端末を入れ直すと目覚ましは消えるので掛け直す。その間に過ぎたものも fire が拾う */
        Notices.fire(context)
    }
}
