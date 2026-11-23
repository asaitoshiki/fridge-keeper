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
    private const val KEY_ANSWERS = "answers"
    private const val GROUP = "expiry"
    private const val CHANNEL = "expiry"

    /* 端末の電源が切れていたなどで遅れたものは、この時間までなら出す。それより古いものは今さら知らせない */
    private const val LATE_LIMIT_MS = 12L * 60 * 60 * 1000

    /** 開いている画面。通知で答えたとき、すぐ在庫に写してもらうために使う。閉じているときは null */
    @Volatile
    var onAnswer: (() -> Unit)? = null

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

    /**
     * 通知の中のボタンで答えたとき。答えは控えておき、アプリが開いたときにウェブ版が受け取って在庫に写す。
     * 同じ食材について、このあと出す予定の知らせはもう要らないので消しておく。
     */
    fun answer(context: Context, itemId: String, action: String, notificationId: Int) {
        NotificationManagerCompat.from(context).cancel(notificationId)
        if (action == "KEEP") return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val answers = runCatching { JSONArray(prefs.getString(KEY_ANSWERS, "[]")) }.getOrElse { JSONArray() }
        answers.put(JSONObject().put("itemId", itemId).put("action", action).put("at", System.currentTimeMillis()))
        /* 食べきった・捨てたなら、この食材のこの先の知らせは要らない。1つ食べただけなら残す */
        val rest = JSONArray()
        load(context).filter { action == "EAT_ONE" || it.optString("itemId") != itemId }.forEach { rest.put(it) }
        prefs.edit().putString(KEY_ANSWERS, answers.toString()).putString(KEY_LIST, rest.toString()).apply()
        scheduleNext(context)
        onAnswer?.invoke()
    }

    /** 溜まっている答えを渡して空にする */
    fun takeAnswers(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val answers = prefs.getString(KEY_ANSWERS, "[]") ?: "[]"
        prefs.edit().remove(KEY_ANSWERS).apply()
        return answers
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
        val itemId = notice.optString("itemId")
        /* 食材と時刻ごとに番号を分ける。同じ時刻の別の食材で上書きしないように */
        val id = (itemId + notice.optLong("at")).hashCode()
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(notice.optString("title"))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setGroup(GROUP)
        /* その場で答えられるボタン。答えはアプリを開いたときに在庫へ写る */
        if (itemId.isNotEmpty()) {
            /* 数のあるもの（卵など）は一つずつ減らせるようにする。ボタンは3つまでなので、捨てたはアプリの中で */
            val actions = if (notice.optInt("quantity", 1) > 1) {
                listOf("EAT_ONE" to "1つ食べた", "EATEN" to "食べきった", "KEEP" to "まだある")
            } else {
                listOf("EATEN" to "食べきった", "DISCARDED" to "捨てた", "KEEP" to "まだある")
            }
            actions.forEachIndexed { index, (action, label) ->
                val intent = Intent(context, NoticeReceiver::class.java)
                    .setAction(ACTION_ANSWER)
                    .putExtra(EXTRA_ITEM, itemId)
                    .putExtra(EXTRA_ANSWER, action)
                    .putExtra(EXTRA_NOTIFICATION, id)
                val pending = PendingIntent.getBroadcast(
                    context, id * 4 + index, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                builder.addAction(0, label, pending)
            }
        }
        runCatching { NotificationManagerCompat.from(context).notify(id, builder.build()) }
    }

    const val ACTION_FIRE = "com.asaitoshiki.fridgemap.NOTICE"
    const val ACTION_ANSWER = "com.asaitoshiki.fridgemap.ANSWER"
    const val EXTRA_ITEM = "itemId"
    const val EXTRA_ANSWER = "answer"
    const val EXTRA_NOTIFICATION = "notificationId"
}

/** 目覚ましが鳴ったとき、端末を入れ直したとき、アプリを入れ直したときに呼ばれる */
class NoticeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Notices.ACTION_ANSWER) {
            Notices.answer(
                context,
                intent.getStringExtra(Notices.EXTRA_ITEM) ?: return,
                intent.getStringExtra(Notices.EXTRA_ANSWER) ?: return,
                intent.getIntExtra(Notices.EXTRA_NOTIFICATION, 0),
            )
            return
        }
        /* 端末を入れ直すと目覚ましは消えるので掛け直す。その間に過ぎたものも fire が拾う */
        Notices.fire(context)
    }
}
