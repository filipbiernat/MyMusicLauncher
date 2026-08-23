package expo.modules.bluetoothdetector

import android.app.UiModeManager
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ConfigRecord : Record {
    @Field var carDeviceAddress: String? = null
    @Field var carDeviceName: String? = null
    @Field var playlistUri: String? = null
    @Field var spotifyToken: String? = null
    @Field var spotifyRefreshToken: String? = null
    @Field var spotifyClientId: String? = null
    @Field var shuffleEnabled: Boolean? = null
    @Field var serviceEnabled: Boolean? = null
}

class BluetoothDetectorModule : Module() {
    companion object {
        private const val TAG = "BluetoothDetector"
        private const val EVENT_CONNECTED = "onBluetoothConnected"
        private const val EVENT_DISCONNECTED = "onBluetoothDisconnected"
        private const val EVENT_CAR_MODE_ENTERED = "onCarModeEntered"
        private const val EVENT_CAR_MODE_EXITED = "onCarModeExited"
        private const val PREFS_NAME = "MyMusicLauncherPrefs"
        private const val KEY_SERVICE_ENABLED = "serviceEnabled"
    }

    private var carModeReceiver: BroadcastReceiver? = null
    private var isListening = false

    override fun definition() = ModuleDefinition {
        Name("BluetoothDetector")

        Events(EVENT_CONNECTED, EVENT_DISCONNECTED, EVENT_CAR_MODE_ENTERED, EVENT_CAR_MODE_EXITED)

        Function("startListening") {
            try {
                startListening()
            } catch (e: Exception) {
                Log.e(TAG, "Error in startListening", e)
            }
        }

        Function("stopListening") {
            try {
                stopListening()
            } catch (e: Exception) {
                Log.e(TAG, "Error in stopListening", e)
            }
        }

        Function("isListening") {
            isListening
        }

        Function("getPairedDevices") {
            try {
                getPairedDevicesList()
            } catch (e: Exception) {
                Log.e(TAG, "Error in getPairedDevices", e)
                emptyList<Map<String, String>>()
            }
        }

        Function("getConnectedDevices") {
            try {
                getConnectedDevicesList()
            } catch (e: Exception) {
                Log.e(TAG, "Error in getConnectedDevices", e)
                emptyList<Map<String, String>>()
            }
        }

        Function("startForegroundService") {
            val context = appContext.reactContext ?: return@Function false
            try {
                Log.i(TAG, "═══ startForegroundService called from JS ═══")

                BluetoothForegroundService.onDeviceConnected = { name, address ->
                    try {
                        Log.i(TAG, "[ForegroundService → JS] Connected: $name ($address)")
                        sendEvent(EVENT_CONNECTED, mapOf(
                            "deviceName" to name,
                            "deviceAddress" to address
                        ))
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to send onBluetoothConnected event to JS", e)
                    }
                }

                BluetoothForegroundService.onDeviceDisconnected = { name, address ->
                    try {
                        Log.i(TAG, "[ForegroundService → JS] Disconnected: $name ($address)")
                        sendEvent(EVENT_DISCONNECTED, mapOf(
                            "deviceName" to name,
                            "deviceAddress" to address
                        ))
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to send onBluetoothDisconnected event to JS", e)
                    }
                }

                BluetoothForegroundService.start(context)
                saveServiceEnabled(context, true)
                Log.i(TAG, "✓ Foreground Service started + serviceEnabled saved")
                true
            } catch (e: Exception) {
                Log.e(TAG, "✗ Failed to start Foreground Service", e)
                false
            }
        }

        Function("stopForegroundService") {
            val context = appContext.reactContext
            if (context != null) {
                try {
                    Log.i(TAG, "═══ stopForegroundService called from JS ═══")
                    BluetoothForegroundService.onDeviceConnected = null
                    BluetoothForegroundService.onDeviceDisconnected = null
                    BluetoothForegroundService.stop(context)
                    saveServiceEnabled(context, false)
                    Log.i(TAG, "✓ Foreground Service stopped + serviceEnabled cleared")
                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping foreground service", e)
                }
            }
        }

        Function("isServiceRunning") {
            try {
                val context = appContext.reactContext ?: return@Function false
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val enabled = prefs.getBoolean(KEY_SERVICE_ENABLED, false)
                Log.d(TAG, "isServiceRunning check: serviceEnabled=$enabled")
                enabled
            } catch (e: Exception) {
                Log.e(TAG, "Error checking isServiceRunning", e)
                false
            }
        }

        Function("syncConfig") { config: ConfigRecord ->
            val context = appContext.reactContext
            if (context != null) {
                try {
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val editor = prefs.edit()
                    config.carDeviceAddress?.let { editor.putString("carDeviceAddress", it) }
                    config.carDeviceName?.let { editor.putString("carDeviceName", it) }
                    config.playlistUri?.let { editor.putString("playlistUri", it) }
                    config.spotifyToken?.let { editor.putString("spotifyToken", it) }
                    config.spotifyRefreshToken?.let { editor.putString("spotifyRefreshToken", it) }
                    config.spotifyClientId?.let { editor.putString("spotifyClientId", it) }
                    config.shuffleEnabled?.let { editor.putBoolean("shuffleEnabled", it) }
                    config.serviceEnabled?.let { editor.putBoolean("serviceEnabled", it) }
                    editor.apply()
                    Log.i(TAG, "✓ Config synced to native SharedPreferences: car=${config.carDeviceAddress}, playlist=${config.playlistUri}")
                    true
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing config", e)
                    false
                }
            } else {
                false
            }
        }

        OnDestroy {
            try {
                stopListening()
            } catch (e: Exception) {
                Log.w(TAG, "Error during OnDestroy", e)
            }
        }
    }

    private fun startListening() {
        if (isListening) return

        val context = appContext.reactContext ?: return

        carModeReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                when (intent.action) {
                    UiModeManager.ACTION_ENTER_CAR_MODE -> {
                        Log.d(TAG, "Entered car mode")
                        try {
                            sendEvent(EVENT_CAR_MODE_ENTERED, mapOf<String, Any>())
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to send car mode entered event", e)
                        }
                    }
                    UiModeManager.ACTION_EXIT_CAR_MODE -> {
                        Log.d(TAG, "Exited car mode")
                        try {
                            sendEvent(EVENT_CAR_MODE_EXITED, mapOf<String, Any>())
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to send car mode exited event", e)
                        }
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(UiModeManager.ACTION_ENTER_CAR_MODE)
            addAction(UiModeManager.ACTION_EXIT_CAR_MODE)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(carModeReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                context.registerReceiver(carModeReceiver, filter)
            }
            isListening = true
            Log.d(TAG, "Started listening (car mode receiver)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register carModeReceiver", e)
        }
    }

    private fun stopListening() {
        if (!isListening) return

        val context = appContext.reactContext ?: return
        carModeReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Receiver already unregistered", e)
            }
        }
        carModeReceiver = null
        isListening = false
        Log.d(TAG, "Stopped listening")
    }

    private fun getPairedDevicesList(): List<Map<String, String>> {
        val context = appContext.reactContext ?: return emptyList()
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter ?: return emptyList()

        return try {
            adapter.bondedDevices?.map { device ->
                mapOf(
                    "name" to (device.name ?: "Unknown"),
                    "address" to (device.address ?: "Unknown")
                )
            } ?: emptyList()
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLUETOOTH_CONNECT permission for paired devices", e)
            emptyList()
        }
    }

    private fun getConnectedDevicesList(): List<Map<String, String>> {
        val context = appContext.reactContext ?: return emptyList()
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter ?: return emptyList()

        val connectedDevices = mutableListOf<Map<String, String>>()

        try {
            val bondedDevices = adapter.bondedDevices ?: return emptyList()
            for (device in bondedDevices) {
                try {
                    val method = device.javaClass.getMethod("isConnected")
                    val isConnected = method.invoke(device) as Boolean
                    if (isConnected) {
                        connectedDevices.add(mapOf(
                            "name" to (device.name ?: "Unknown"),
                            "address" to (device.address ?: "Unknown")
                        ))
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Could not check connection state for ${device.address}", e)
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLUETOOTH_CONNECT permission", e)
        }

        Log.d(TAG, "Currently connected devices: ${connectedDevices.size}")
        return connectedDevices
    }

    private fun saveServiceEnabled(context: Context, enabled: Boolean) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(KEY_SERVICE_ENABLED, enabled).apply()
            Log.d(TAG, "SharedPreferences: serviceEnabled=$enabled")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to saveServiceEnabled", e)
        }
    }
}
