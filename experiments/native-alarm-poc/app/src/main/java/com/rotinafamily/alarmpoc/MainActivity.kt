package com.rotinafamily.alarmpoc

import android.app.*
import android.content.*
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.widget.*
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : Activity() {
    private lateinit var info: TextView
    private lateinit var audit: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermission()
        render()
        record("APP_OPEN", "Rotina Family Alarm v3-audit")
        handleCommand(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleCommand(intent)
    }

    private fun render() {
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48,48,48,48) }
        layout.addView(TextView(this).apply { text = "Rotina Family — Integração nativa v3-audit"; textSize = 22f })
        info = TextView(this).apply { text = "Esta versão não possui teste local. Ela aceita somente alarmes enviados pela PWA."; textSize = 16f }
        audit = TextView(this).apply { textSize = 13f; setPadding(0,24,0,24) }
        val clear = Button(this).apply { text = "LIMPAR AUDITORIA" }
        layout.addView(info); layout.addView(audit); layout.addView(clear); setContentView(layout)
        clear.setOnClickListener { AuditLog.clear(this); refreshAudit() }
        refreshAudit()
    }

    private fun handleCommand(source: Intent?) {
        val data: Uri = source?.data ?: return
        if (data.scheme != "rotinafamily" || data.host != "alarm") {
            record("COMMAND_REJECTED", data.toString())
            return
        }
        val action = data.pathSegments.firstOrNull() ?: return
        val key = data.getQueryParameter("key").orEmpty()
        val title = data.getQueryParameter("title").orEmpty().ifBlank { "Tarefa" }
        val moment = data.getQueryParameter("moment").orEmpty()
        val taskId = data.getQueryParameter("taskId").orEmpty()
        val date = data.getQueryParameter("date").orEmpty()
        record("COMMAND_RECEIVED", "action=$action key=$key task=$taskId date=$date moment=$moment")
        when (action) {
            "schedule" -> {
                val at = data.getQueryParameter("at")?.toLongOrNull() ?: 0L
                if (ensureExactAlarmPermission()) return
                val ok = AlarmScheduler.schedule(this, key, title, moment, at)
                info.text = if (ok) "Alarme da PWA sincronizado: $title." else "Falha ao sincronizar alarme da PWA."
                record(if (ok) "SCHEDULE_OK" else "SCHEDULE_FAIL", "key=$key at=$at title=$title")
                Toast.makeText(this, info.text, Toast.LENGTH_LONG).show()
            }
            "cancel" -> {
                AlarmScheduler.cancel(this, key)
                info.text = "Alarme da PWA removido: $title."
                record("CANCEL_OK", "key=$key title=$title")
            }
            else -> record("ACTION_REJECTED", action)
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
            record("PERMISSION_REQUIRED", "SCHEDULE_EXACT_ALARM")
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply { data = Uri.parse("package:$packageName") })
            info.text = "Autorize Alarmes e lembretes e sincronize novamente pela PWA."
            return true
        }
        return false
    }

    private fun record(event: String, detail: String) {
        AuditLog.add(this, event, detail)
        if (::audit.isInitialized) refreshAudit()
    }

    private fun refreshAudit() {
        audit.text = "AUDITORIA LOCAL\n" + AuditLog.read(this).joinToString("\n")
    }
}

object AuditLog {
    private const val PREF = "rf_alarm_audit"
    private const val KEY = "events"
    private val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    fun add(context: Context, event: String, detail: String) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val list = read(context).toMutableList()
        list.add("${formatter.format(Date())} | $event | $detail")
        while (list.size > 100) list.removeAt(0)
        prefs.edit().putString(KEY, list.joinToString("\n")).apply()
    }

    fun read(context: Context): List<String> = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        .getString(KEY, "").orEmpty().lines().filter { it.isNotBlank() }

    fun clear(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().remove(KEY).apply()
}
