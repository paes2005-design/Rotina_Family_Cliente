package com.rotinafamily.alarmpoc

import android.app.*
import android.content.*
import android.os.*
import android.widget.*

class AlarmActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48,48,48,48) }
        layout.addView(TextView(this).apply { text = "ROTINA FAMILY"; textSize = 28f })
        layout.addView(TextView(this).apply { text = "Despertador de teste v2"; textSize = 22f })
        layout.addView(Button(this).apply {
            text = "PARAR"
            setOnClickListener {
                startService(Intent(this@AlarmActivity, AlarmService::class.java).setAction(AlarmService.ACTION_STOP))
                finishAndRemoveTask()
            }
        })
        setContentView(layout)
    }
}
