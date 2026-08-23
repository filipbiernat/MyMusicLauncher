package expo.modules.bluetoothdetector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * A real Android Foreground Service that keeps the BroadcastReceiver alive
 * even when the React Native app is in the background or killed.
 *
 * This service:
 * 1. Registers a BroadcastReceiver for ACL_CONNECTED/DISCONNECTED
 * 2. Maintains a persistent notification (Foreground Service requirement)
 * 3. Holds a partial WakeLock to survive Doze mode
 * 4. Sends events back to the Expo module via a static callback
 */
class BluetoothForegroundService : Service() {

    companion object {
        private const val TAG = "BT_ForegroundService"
        private const val CHANNEL_ID = "bt_detector_channel_v3"
        private const val NOTIFICATION_ID = 9001
        private const val WAKELOCK_TAG = "MyMusicLauncher::BTDetector"

        // Static callback so the Expo module can receive events from this service
        var onDeviceConnected: ((name: String, address: String) -> Unit)? = null
        var onDeviceDisconnected: ((name: String, address: String) -> Unit)? = null

        // Target car device address (set by the module before starting service)
        var targetCarAddress: String? = null

        fun start(context: Context) {
            val intent = Intent(context, BluetoothForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, BluetoothForegroundService::class.java))
        }
    }

    private var bluetoothReceiver: BroadcastReceiver? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var startCount = 0

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "═══ Service onCreate ═══")
        Log.i(TAG, "PID: ${android.os.Process.myPid()}, Thread: ${Thread.currentThread().name}")
        createNotificationChannel()
        acquireWakeLock()
        registerBluetoothReceiver()
        Log.i(TAG, "═══ Service fully initialized ═══")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startCount++
        Log.i(TAG, "═══ onStartCommand #$startCount (flags=$flags, startId=$startId) ═══")
        val notification = buildNotification("Aktywna od: ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}")
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY // Restart service if killed by system
    }

    override fun onDestroy() {
        Log.w(TAG, "═══ Service onDestroy ═══ (startCount was $startCount)")
        unregisterBluetoothReceiver()
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "═══ onTaskRemoved — app swiped away, restarting service ═══")
        // Schedule restart
        val restartIntent = Intent(applicationContext, BluetoothForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
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
        // Try to get the launcher activity for the tap action
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val iconResId = resources.getIdentifier("notification_icon", "drawable", packageName).let {
            if (it != 0) it else android.R.drawable.ic_media_play
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚗 MyMusicLauncher")
            .setContentText(text)
            .setSmallIcon(iconResId)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .build()
    }

    fun updateNotificationText(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm?.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKELOCK_TAG).apply {
            acquire(10 * 60 * 60 * 1000L) // 10 hours max
        }
        Log.d(TAG, "WakeLock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "WakeLock released")
            }
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(bluetoothReceiver, filter)
        }
        Log.d(TAG, "BroadcastReceiver registered in Foreground Service")
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
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }
    }

    private fun handleDeviceConnected(device: BluetoothDevice) {
        try {
            val deviceName = device.name ?: "Unknown"
            val deviceAddress = device.address ?: "Unknown"
            Log.d(TAG, "BT Connected: $deviceName ($deviceAddress)")
            onDeviceConnected?.invoke(deviceName, deviceAddress)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLUETOOTH_CONNECT permission", e)
            onDeviceConnected?.invoke("Permission Denied", "unknown")
        }
    }

    private fun handleDeviceDisconnected(device: BluetoothDevice) {
        try {
            val deviceName = device.name ?: "Unknown"
            val deviceAddress = device.address ?: "Unknown"
            Log.d(TAG, "BT Disconnected: $deviceName ($deviceAddress)")
            onDeviceDisconnected?.invoke(deviceName, deviceAddress)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLUETOOTH_CONNECT permission", e)
            onDeviceDisconnected?.invoke("Permission Denied", "unknown")
        }
    }
}
