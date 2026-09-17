package com.rotinafamily.alarmpoc

import android.app.*
import android.media.*
import android.os.*
import android.provider.Settings
import android.widget.*

class AlarmActivity : Activity() {
    private var player: MediaPlayer? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true); setTurnScreenOn(true)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48,48,48,48) }
        layout.addView(TextView(this).apply { text = "ROTINA FAMILY"; textSize = 28f })
        layout.addView(TextView(this).apply { text = "Despertador de teste"; textSize = 22f })
        layout.addView(Button(this).apply { text = "PARAR"; setOnClickListener { stopAndClose() } })
        setContentView(layout)
        val uri = Settings.System.DEFAULT_ALARM_ALERT_URI ?: Settings.System.DEFAULT_NOTIFICATION_URI
        player = MediaPlayer.create(this, uri)?.apply { isLooping = true; start() }
    }
    private fun stopAndClose() { player?.stop(); player?.release(); player=null; finishAndRemoveTask() }
    override fun onDestroy() { player?.release(); player=null; super.onDestroy() }
}
