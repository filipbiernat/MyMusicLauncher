package expo.modules.bluetoothdetector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Native Android Foreground Service that runs continuously in background.
 *
 * It listens for Bluetooth connect/disconnect events and autonomously controls
 * Spotify playback natively without relying on JavaScript runtime being active.
 */
class BluetoothForegroundService : Service() {

    companion object {
        private const val TAG = "BT_ForegroundService"
        const val PREFS_NAME = "MyMusicLauncherPrefs"
        private const val CHANNEL_ID = "bt_detector_channel_v3"
        private const val NOTIFICATION_ID = 9001
        private const val WAKELOCK_TAG = "MyMusicLauncher::BTDetector"

        // Static callbacks to notify JavaScript module if active
        var onDeviceConnected: ((name: String, address: String) -> Unit)? = null
        var onDeviceDisconnected: ((name: String, address: String) -> Unit)? = null

        fun start(context: Context) {
            try {
                val intent = Intent(context, BluetoothForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to start BluetoothForegroundService", e)
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, BluetoothForegroundService::class.java))
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to stop BluetoothForegroundService", e)
            }
        }
    }

    private var bluetoothReceiver: BroadcastReceiver? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var startCount = 0

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "═══ Service onCreate (PID: ${android.os.Process.myPid()}) ═══")
        try {
            createNotificationChannel()
            acquireWakeLock()
            registerBluetoothReceiver()
        } catch (e: Throwable) {
            Log.e(TAG, "Error in Service onCreate", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startCount++
        Log.i(TAG, "═══ onStartCommand #$startCount ═══")
        try {
            val notification = buildNotification("Aktywna od: ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "startForeground with TYPE_CONNECTED_DEVICE failed, trying without type", e)
            try {
                val notification = buildNotification("Aktywna od: ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}")
                startForeground(NOTIFICATION_ID, notification)
            } catch (e2: Throwable) {
                Log.e(TAG, "Fatal startForeground error", e2)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        Log.w(TAG, "═══ Service onDestroy ═══")
        unregisterBluetoothReceiver()
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "═══ onTaskRemoved — ensuring service stays alive ═══")
        try {
            val restartIntent = Intent(applicationContext, BluetoothForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(restartIntent)
            } else {
                applicationContext.startService(restartIntent)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error in onTaskRemoved restart", e)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Wykrywanie samochodu (MyMusicLauncher)",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Utrzymuje usługę aktywną do wykrywania Bluetooth samochodu"
                setShowBadge(true)
                enableVibration(false)
                setSound(null, null)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚗 MyMusicLauncher")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .build()
    }

    fun updateNotificationText(text: String) {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm?.notify(NOTIFICATION_ID, buildNotification(text))
        } catch (e: Throwable) {
            Log.e(TAG, "Error updating notification text", e)
        }
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKELOCK_TAG).apply {
                acquire(10 * 60 * 60 * 1000L) // 10 hours max
            }
            Log.d(TAG, "WakeLock acquired")
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to acquire WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "WakeLock released")
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to release WakeLock", e)
        }
        wakeLock = null
    }

    private fun registerBluetoothReceiver() {
        bluetoothReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                when (intent.action) {
                    BluetoothDevice.ACTION_ACL_CONNECTED -> {
                        val device = extractDevice(intent)
                        device?.let { handleDeviceConnected(it) }
                    }
                    BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                        val device = extractDevice(intent)
                        device?.let { handleDeviceDisconnected(it) }
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                registerReceiver(bluetoothReceiver, filter)
            }
            Log.i(TAG, "BroadcastReceiver registered in Foreground Service")
        } catch (e: Throwable) {
            Log.e(TAG, "Error registering bluetooth receiver", e)
        }
    }

    private fun unregisterBluetoothReceiver() {
        bluetoothReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Receiver already unregistered", e)
            }
        }
        bluetoothReceiver = null
    }

    private fun extractDevice(intent: Intent): BluetoothDevice? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to extract device from intent", e)
            null
        }
    }

    private fun handleDeviceConnected(device: BluetoothDevice) {
        val deviceName = try { device.name ?: "Unknown" } catch (e: SecurityException) { "Unknown" }
        val deviceAddress = try { device.address ?: "Unknown" } catch (e: SecurityException) { "Unknown" }

        Log.i(TAG, "BT Connected event: $deviceName ($deviceAddress)")

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val carAddress = prefs.getString("carDeviceAddress", null)
        val playlistUri = prefs.getString("playlistUri", null)

        Log.i(TAG, "Comparing with saved carAddress: $carAddress (playlist: $playlistUri)")

        if (carAddress != null && deviceAddress.equals(carAddress, ignoreCase = true)) {
            Log.i(TAG, "🎯 CAR MATCHED! Starting Spotify playback directly from native background service...")
            updateNotificationText("🎵 Wykryto samochód ($deviceName) — uruchamiam muzykę...")

            // Start autonomous background playback thread
            Thread {
                performNativePlayback(playlistUri ?: "spotify:playlist:7l6VkTQ0Hjomh4USXsoGw7", deviceName)
            }.start()
        }

        // Notify JS layer if alive
        try {
            onDeviceConnected?.invoke(deviceName, deviceAddress)
        } catch (e: Exception) {
            Log.w(TAG, "Could not invoke onDeviceConnected in JS", e)
        }
    }

    private fun handleDeviceDisconnected(device: BluetoothDevice) {
        val deviceName = try { device.name ?: "Unknown" } catch (e: SecurityException) { "Unknown" }
        val deviceAddress = try { device.address ?: "Unknown" } catch (e: SecurityException) { "Unknown" }

        Log.i(TAG, "BT Disconnected event: $deviceName ($deviceAddress)")

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val carAddress = prefs.getString("carDeviceAddress", null)

        if (carAddress != null && deviceAddress.equals(carAddress, ignoreCase = true)) {
            Log.i(TAG, "🛑 CAR DISCONNECTED! Pausing Spotify playback natively...")
            updateNotificationText("🚗 Rozłączono z $deviceName — oczekuję na samochód...")

            Thread {
                performNativePause()
            }.start()
        }

        // Notify JS layer if alive
        try {
            onDeviceDisconnected?.invoke(deviceName, deviceAddress)
        } catch (e: Exception) {
            Log.w(TAG, "Could not invoke onDeviceDisconnected in JS", e)
        }
    }

    /**
     * Executes Spotify playback autonomously:
     * 1. Try Spotify Web API (PUT /me/player/play with context_uri)
     * 2. If token expired, refresh token and retry
     * 3. Fallback: Launch Spotify URI Intent + media play keyevent
     */
    private fun performNativePlayback(playlistUri: String, deviceName: String) {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            var token = prefs.getString("spotifyToken", null)
            val refreshToken = prefs.getString("spotifyRefreshToken", null)
            val clientId = prefs.getString("spotifyClientId", null)
            val shuffle = prefs.getBoolean("shuffleEnabled", true)

            var played = false

            if (!token.isNullOrEmpty()) {
                Log.i(TAG, "Attempting Spotify Web API playback...")
                played = playSpotifyWebApi(token, playlistUri, shuffle)

                if (!played && !refreshToken.isNullOrEmpty() && !clientId.isNullOrEmpty()) {
                    Log.i(TAG, "Web API play failed (likely 401), attempting token refresh...")
                    val newToken = refreshSpotifyToken(refreshToken, clientId)
                    if (!newToken.isNullOrEmpty()) {
                        token = newToken
                        played = playSpotifyWebApi(token, playlistUri, shuffle)
                    }
                }
            }

            // Fallback: If Web API did not succeed, open Spotify Intent
            if (!played) {
                Log.i(TAG, "Web API not available or no active Spotify session. Opening Spotify Intent...")
                launchSpotifyIntent(playlistUri)

                // Wait 2.5s for Spotify to initialize and retry Web API or send media play key
                try {
                    Thread.sleep(2500)
                } catch (ignored: InterruptedException) {}

                if (!token.isNullOrEmpty()) {
                    played = playSpotifyWebApi(token, playlistUri, shuffle)
                }
                if (!played) {
                    sendMediaPlayKey()
                }
            }

            updateNotificationText("🎵 Odtwarzam muzykę w $deviceName")
        } catch (e: Throwable) {
            Log.e(TAG, "Error in performNativePlayback", e)
        }
    }

    private fun performNativePause() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val token = prefs.getString("spotifyToken", null)

            if (!token.isNullOrEmpty()) {
                pauseSpotifyWebApi(token)
            }
            sendMediaPauseKey()
        } catch (e: Throwable) {
            Log.e(TAG, "Error in performNativePause", e)
        }
    }

    private fun playSpotifyWebApi(token: String, playlistUri: String, shuffle: Boolean): Boolean {
        // Set shuffle
        try {
            val shuffleUrl = URL("https://api.spotify.com/v1/me/player/shuffle?state=$shuffle")
            val conn = (shuffleUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                setRequestProperty("Authorization", "Bearer $token")
                connectTimeout = 3000
                readTimeout = 3000
            }
            val code = conn.responseCode
            conn.disconnect()
            Log.d(TAG, "Spotify shuffle response: $code")
        } catch (e: Throwable) {
            Log.w(TAG, "Failed to set shuffle via Web API", e)
        }

        // Start playback
        return try {
            val playUrl = URL("https://api.spotify.com/v1/me/player/play")
            val conn = (playUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 4000
                readTimeout = 4000
            }
            val jsonBody = "{\"context_uri\":\"$playlistUri\"}"
            conn.outputStream.use { it.write(jsonBody.toByteArray()) }
            val code = conn.responseCode
            conn.disconnect()
            Log.i(TAG, "Spotify play Web API response: $code")
            code == 200 || code == 204
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to play via Web API", e)
            false
        }
    }

    private fun pauseSpotifyWebApi(token: String): Boolean {
        return try {
            val pauseUrl = URL("https://api.spotify.com/v1/me/player/pause")
            val conn = (pauseUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                setRequestProperty("Authorization", "Bearer $token")
                connectTimeout = 3000
                readTimeout = 3000
            }
            val code = conn.responseCode
            conn.disconnect()
            Log.i(TAG, "Spotify pause Web API response: $code")
            code == 200 || code == 204
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to pause via Web API", e)
            false
        }
    }

    private fun refreshSpotifyToken(refreshToken: String, clientId: String): String? {
        return try {
            val url = URL("https://accounts.spotify.com/api/token")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                doOutput = true
                connectTimeout = 5000
                readTimeout = 5000
            }
            val postData = "grant_type=refresh_token&refresh_token=${URLEncoder.encode(refreshToken, "UTF-8")}&client_id=${URLEncoder.encode(clientId, "UTF-8")}"
            conn.outputStream.use { it.write(postData.toByteArray()) }
            if (conn.responseCode == 200) {
                val response = conn.inputStream.bufferedReader().use { it.readText() }
                val json = org.json.JSONObject(response)
                val newAccessToken = json.optString("access_token")
                val newRefreshToken = json.optString("refresh_token")
                val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val editor = prefs.edit().putString("spotifyToken", newAccessToken)
                if (newRefreshToken.isNotEmpty()) {
                    editor.putString("spotifyRefreshToken", newRefreshToken)
                }
                editor.apply()
                Log.i(TAG, "✓ Spotify token refreshed natively in background")
                newAccessToken
            } else {
                Log.w(TAG, "Token refresh failed with code: ${conn.responseCode}")
                null
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to refresh token natively", e)
            null
        }
    }

    private fun launchSpotifyIntent(playlistUri: String) {
        try {
            val uri = Uri.parse(playlistUri)
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                `package` = "com.spotify.music"
            }
            startActivity(intent)
            Log.i(TAG, "Spotify intent launched with package for $playlistUri")
        } catch (e: Throwable) {
            Log.w(TAG, "Could not launch with Spotify package, trying generic VIEW", e)
            try {
                val genericIntent = Intent(Intent.ACTION_VIEW, Uri.parse(playlistUri)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(genericIntent)
            } catch (e2: Throwable) {
                Log.e(TAG, "Failed to launch intent", e2)
            }
        }
    }

    private fun sendMediaPlayKey() {
        try {
            val intentDown = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                `package` = "com.spotify.music"
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY))
            }
            sendOrderedBroadcast(intentDown, null)
            val intentUp = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                `package` = "com.spotify.music"
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY))
            }
            sendOrderedBroadcast(intentUp, null)
            Log.i(TAG, "Sent KEYCODE_MEDIA_PLAY broadcast to Spotify")
        } catch (e: Throwable) {
            Log.w(TAG, "sendMediaPlayKey failed", e)
        }
    }

    private fun sendMediaPauseKey() {
        try {
            val intentDown = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                `package` = "com.spotify.music"
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE))
            }
            sendOrderedBroadcast(intentDown, null)
            val intentUp = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                `package` = "com.spotify.music"
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE))
            }
            sendOrderedBroadcast(intentUp, null)
            Log.i(TAG, "Sent KEYCODE_MEDIA_PAUSE broadcast to Spotify")
        } catch (e: Throwable) {
            Log.w(TAG, "sendMediaPauseKey failed", e)
        }
    }
}
