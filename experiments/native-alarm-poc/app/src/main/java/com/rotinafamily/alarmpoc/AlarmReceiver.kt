package com.rotinafamily.alarmpoc

import android.content.*
import android.os.Build

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val serviceIntent = Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_START)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
    }
}
