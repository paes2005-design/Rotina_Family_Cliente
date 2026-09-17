package com.rotinafamily.alarmpoc

import android.app.*
import android.content.*
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.widget.*

class MainActivity : Activity() {
    private lateinit var info: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermission()
        render()
        handleCommand(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleCommand(intent)
    }

    private fun render() {
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48,48,48,48) }
        val title = TextView(this).apply { text = "Rotina Family — Alarme Android v3"; textSize = 22f }
        info = TextView(this).apply { text = "Integração de teste pronta. Configure um despertador na PWA e use o botão Sincronizar no celular."; textSize = 16f }
        val button = Button(this).apply { text = "TESTE LOCAL +2 MINUTOS" }
        layout.addView(title); layout.addView(info); layout.addView(button); setContentView(layout)
        button.setOnClickListener { scheduleLocalTest() }
    }

    private fun handleCommand(source: Intent?) {
        val data: Uri = source?.data ?: return
        if (data.scheme != "rotinafamily" || data.host != "alarm") return
        val action = data.pathSegments.firstOrNull() ?: return
        val key = data.getQueryParameter("key").orEmpty()
        val title = data.getQueryParameter("title").orEmpty().ifBlank { "Tarefa" }
        val moment = data.getQueryParameter("moment").orEmpty()
        when (action) {
            "schedule" -> {
                val at = data.getQueryParameter("at")?.toLongOrNull() ?: 0L
                if (ensureExactAlarmPermission()) return
                val ok = AlarmScheduler.schedule(this, key, title, moment, at)
                info.text = if (ok) "Alarme nativo sincronizado: $title." else "Não foi possível sincronizar este horário."
                Toast.makeText(this, info.text, Toast.LENGTH_LONG).show()
            }
            "cancel" -> {
                AlarmScheduler.cancel(this, key)
                info.text = "Alarme nativo removido: $title."
                Toast.makeText(this, info.text, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 2001)
        }
    }

    private fun ensureExactAlarmPermission(): Boolean {
        val manager = getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply { data = Uri.parse("package:$packageName") })
            info.text = "Autorize Alarmes e lembretes e depois sincronize novamente pela PWA."
            return true
        }
        return false
    }

    private fun scheduleLocalTest() {
        if (ensureExactAlarmPermission()) return
        val ok = AlarmScheduler.schedule(this, "local-test", "Teste Rotina Family", "inicio", System.currentTimeMillis() + 120000L)
        info.text = if (ok) "Teste local agendado para +2 minutos." else "Não foi possível agendar o teste local."
    }
}
