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
            startListening()
        }

        Function("stopListening") {
            stopListening()
        }

        Function("isListening") {
            isListening
        }

        Function("getPairedDevices") {
            getPairedDevicesList()
        }

        Function("getConnectedDevices") {
            getConnectedDevicesList()
        }

        /**
         * Start the native Foreground Service for background BT detection.
         * This keeps the BroadcastReceiver alive even when the app is killed.
         */
        Function("startForegroundService") {
            val context = appContext.reactContext ?: return@Function false
            try {
                Log.i(TAG, "═══ startForegroundService called from JS ═══")
                
                // Wire up callbacks from the Foreground Service to this module's events
                BluetoothForegroundService.onDeviceConnected = { name, address ->
                    Log.i(TAG, "[ForegroundService → JS] Connected: $name ($address)")
                    sendEvent(EVENT_CONNECTED, mapOf(
                        "deviceName" to name,
                        "deviceAddress" to address
                    ))
                }
                BluetoothForegroundService.onDeviceDisconnected = { name, address ->
                    Log.i(TAG, "[ForegroundService → JS] Disconnected: $name ($address)")
                    sendEvent(EVENT_DISCONNECTED, mapOf(
                        "deviceName" to name,
                        "deviceAddress" to address
                    ))
                }

                BluetoothForegroundService.start(context)
                
                // Save to SharedPreferences so BootReceiver knows to auto-start
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
                Log.i(TAG, "═══ stopForegroundService called from JS ═══")
                BluetoothForegroundService.onDeviceConnected = null
                BluetoothForegroundService.onDeviceDisconnected = null
                BluetoothForegroundService.stop(context)
                saveServiceEnabled(context, false)
                Log.i(TAG, "✓ Foreground Service stopped + serviceEnabled cleared")
            }
        }

        Function("isServiceRunning") {
            val context = appContext.reactContext ?: return@Function false
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val enabled = prefs.getBoolean(KEY_SERVICE_ENABLED, false)
            Log.d(TAG, "isServiceRunning check: serviceEnabled=$enabled")
            enabled
        }

        OnDestroy {
            stopListening()
            // Don't stop the Foreground Service on module destroy —
            // it should keep running independently
        }
    }

    private fun startListening() {
        if (isListening) {
            Log.d(TAG, "Already listening")
            return
        }

        val context = appContext.reactContext ?: return

        // Register only for car mode events here.
        // BT connect/disconnect events are handled by the Foreground Service.
        carModeReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                when (intent.action) {
                    UiModeManager.ACTION_ENTER_CAR_MODE -> {
                        Log.d(TAG, "Entered car mode")
                        sendEvent(EVENT_CAR_MODE_ENTERED, mapOf<String, Any>())
                    }
                    UiModeManager.ACTION_EXIT_CAR_MODE -> {
                        Log.d(TAG, "Exited car mode")
                        sendEvent(EVENT_CAR_MODE_EXITED, mapOf<String, Any>())
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(UiModeManager.ACTION_ENTER_CAR_MODE)
            addAction(UiModeManager.ACTION_EXIT_CAR_MODE)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(carModeReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(carModeReceiver, filter)
        }

        isListening = true
        Log.d(TAG, "Started listening (car mode receiver)")
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

    /**
     * Check which bonded devices are currently connected.
     * Uses hidden BluetoothDevice.isConnected() via reflection.
     */
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
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_SERVICE_ENABLED, enabled).apply()
        Log.d(TAG, "SharedPreferences: serviceEnabled=$enabled")
    }
}
