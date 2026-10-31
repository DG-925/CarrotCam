package com.carrotcam.carrotcam

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps the camera streaming while the screen is off or another app is in
 * front. Android stops camera access for apps in the background unless a
 * foreground service of type "camera" is running, so one runs (with a
 * notification) for as long as the phone is connected to a PC. It also holds
 * a CPU and a Wi-Fi lock so the stream doesn't stall when the screen turns off.
 */
class StreamService : Service() {
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    @Suppress("DEPRECATION")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val pc = intent?.getStringExtra("pc") ?: "your PC"
        val notification = buildNotification(pc)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
            } else {
                startForeground(ID, notification)
            }
        } catch (e: Exception) {
            // not allowed right now: the stream still runs while the app is open
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        if (wake == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CarrotCam:stream").apply {
                setReferenceCounted(false)
                acquire(8 * 60 * 60 * 1000L)
            }
        }
        if (wifi == null) {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            else WifiManager.WIFI_MODE_FULL_HIGH_PERF
            wifi = wm.createWifiLock(mode, "CarrotCam:stream").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        try {
            wake?.release()
        } catch (_: Exception) {}
        try {
            wifi?.release()
        } catch (_: Exception) {}
        wake = null
        wifi = null
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun buildNotification(pc: String): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Streaming", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shown while CarrotCam sends your camera to a PC"
                    setShowBadge(false)
                }
            )
        }
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL)
        else Notification.Builder(this)
        return builder
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("CarrotCam is your webcam")
            .setContentText("Connected to $pc. Works with the screen off.")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val ID = 4711
        private const val CHANNEL = "stream"

        @Volatile
        var running = false

        /**
         * Android only lets a camera service start while the app is on screen and
         * may use the camera; starting it otherwise would crash the app, so it is
         * skipped (the stream then runs while the app is open, as before).
         */
        fun start(context: Context, pc: String): Boolean {
            if (running) return true
            if (!MainActivity.visible) return false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                context.checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
            ) return false
            val intent = Intent(context, StreamService::class.java).putExtra("pc", pc)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
            return true
        }

        fun stop(context: Context) {
            running = false
            context.stopService(Intent(context, StreamService::class.java))
        }
    }
}
