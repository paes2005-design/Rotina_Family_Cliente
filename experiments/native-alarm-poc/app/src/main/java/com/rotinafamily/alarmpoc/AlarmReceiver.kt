package com.rotinafamily.alarmpoc

import android.content.*
import android.os.Build

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val key = intent?.getStringExtra(AlarmScheduler.EXTRA_KEY).orEmpty()
        val title = intent?.getStringExtra(AlarmScheduler.EXTRA_TITLE).orEmpty()
        val moment = intent?.getStringExtra(AlarmScheduler.EXTRA_MOMENT).orEmpty()
        AuditLog.add(context, "ALARM_FIRED", "key=$key title=$title moment=$moment")
        val serviceIntent = Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_START).apply {
            putExtra(AlarmScheduler.EXTRA_TITLE, title)
            putExtra(AlarmScheduler.EXTRA_MOMENT, moment)
        }
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
    }
}
