package com.rotinafamily.alarmpoc

import android.app.*
import android.content.*
import android.os.*
import android.provider.Settings
import android.widget.*

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermission()

        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48,48,48,48) }
        val title = TextView(this).apply { text = "Rotina Family — Teste do Despertador v2"; textSize = 22f }
        val info = TextView(this).apply { text = "Agenda um alarme nativo para 2 minutos. Depois feche este app e a PWA e bloqueie o celular."; textSize = 16f }
        val button = Button(this).apply { text = "AGENDAR TESTE PARA +2 MINUTOS" }
        layout.addView(title); layout.addView(info); layout.addView(button); setContentView(layout)
        button.setOnClickListener { schedule(info) }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 2001)
        }
    }

    private fun schedule(info: TextView) {
        val manager = getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply { data = android.net.Uri.parse("package:$packageName") })
            info.text = "Autorize Alarmes e lembretes e volte para tocar no botão novamente."
            return
        }
        val operation = PendingIntent.getBroadcast(this, 1001, Intent(this, AlarmReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val showIntent = PendingIntent.getActivity(this, 1002, Intent(this, AlarmActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val triggerAt = System.currentTimeMillis() + 120000L
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showIntent), operation)
        info.text = "Agendado. Feche este app e a PWA, bloqueie o celular e aguarde 2 minutos sem tocar no Push."
    }
}
