package com.rotinafamily.alarmpoc

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object AlarmScheduler {
    const val EXTRA_KEY = "alarm_key"
    const val EXTRA_TITLE = "alarm_title"
    const val EXTRA_MOMENT = "alarm_moment"

    fun schedule(context: Context, key: String, title: String, moment: String, triggerAt: Long): Boolean {
        if (key.isBlank() || triggerAt <= System.currentTimeMillis()) return false
        val manager = context.getSystemService(AlarmManager::class.java)
        if (android.os.Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) return false
        val requestCode = requestCode(key)
        val receiver = PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, AlarmReceiver::class.java).apply {
                putExtra(EXTRA_KEY, key)
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_MOMENT, moment)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val show = PendingIntent.getActivity(
            context,
            requestCode,
            Intent(context, AlarmActivity::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_MOMENT, moment)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, show), receiver)
        return true
    }

    fun cancel(context: Context, key: String) {
        if (key.isBlank()) return
        val operation = PendingIntent.getBroadcast(
            context,
            requestCode(key),
            Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(operation)
        operation.cancel()
    }

    private fun requestCode(key: String): Int = key.hashCode() and 0x7fffffff
}
