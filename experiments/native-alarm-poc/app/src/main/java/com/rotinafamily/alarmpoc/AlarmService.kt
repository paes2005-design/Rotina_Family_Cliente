package com.rotinafamily.alarmpoc

import android.app.*
import android.content.*
import android.media.*
import android.os.*
import android.provider.Settings

class AlarmService : Service() {
    companion object {
        const val ACTION_START = "com.rotinafamily.alarmpoc.START"
        const val ACTION_STOP = "com.rotinafamily.alarmpoc.STOP"
        private const val CHANNEL_ID = "rotina_family_alarm"
        private const val NOTIFICATION_ID = 3001
    }

    private var player: MediaPlayer? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopAlarm()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        startAudio()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?) = null

    private fun startAudio() {
        if (player?.isPlaying == true) return
        val uri = Settings.System.DEFAULT_ALARM_ALERT_URI ?: Settings.System.DEFAULT_NOTIFICATION_URI
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            setDataSource(this@AlarmService, uri)
            isLooping = true
            prepare()
            start()
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(this, 3002, Intent(this, AlarmActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 3003, Intent(this, AlarmService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Rotina Family")
            .setContentText("Despertador de teste")
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .addAction(Notification.Action.Builder(null, "PARAR", stop).build())
            .build()
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "Alarmes Rotina Family", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Alarmes agendados do Rotina Family"
            setSound(null, null)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun stopAlarm() {
        player?.runCatching { stop() }
        player?.release()
        player = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }
}
