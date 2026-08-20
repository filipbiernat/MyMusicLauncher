package expo.modules.bluetoothdetector

import android.app.UiModeManager
import android.bluetooth.BluetoothAdapter
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
    }

    private var bluetoothReceiver: BroadcastReceiver? = null
    private var isListening = false

    override fun definition() = ModuleDefinition {
        Name("BluetoothDetector")

        Events(EVENT_CONNECTED, EVENT_DISCONNECTED, EVENT_CAR_MODE_ENTERED, EVENT_CAR_MODE_EXITED)

        Function("startListening") {
            startBluetoothListening()
        }

        Function("stopListening") {
            stopBluetoothListening()
        }

        Function("isListening") {
            isListening
        }

        Function("getPairedDevices") {
            getPairedDevicesList()
        }

        OnDestroy {
            stopBluetoothListening()
        }
    }

    private fun startBluetoothListening() {
        if (isListening) {
            Log.d(TAG, "Already listening for Bluetooth events")
            return
        }

        val context = appContext.reactContext ?: return

        bluetoothReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return

                when (intent.action) {
                    BluetoothDevice.ACTION_ACL_CONNECTED -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }
                        device?.let {
                            try {
                                val deviceName = it.name ?: "Unknown"
                                val deviceAddress = it.address ?: "Unknown"
                                Log.d(TAG, "Bluetooth connected: $deviceName ($deviceAddress)")
                                sendEvent(EVENT_CONNECTED, mapOf(
                                    "deviceName" to deviceName,
                                    "deviceAddress" to deviceAddress
                                ))
                            } catch (e: SecurityException) {
                                Log.e(TAG, "Missing BLUETOOTH_CONNECT permission", e)
                                sendEvent(EVENT_CONNECTED, mapOf(
                                    "deviceName" to "Permission Denied",
                                    "deviceAddress" to "unknown"
                                ))
                            }
                        }
                    }
                    BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }
                        device?.let {
                            try {
                                val deviceName = it.name ?: "Unknown"
                                val deviceAddress = it.address ?: "Unknown"
                                Log.d(TAG, "Bluetooth disconnected: $deviceName ($deviceAddress)")
                                sendEvent(EVENT_DISCONNECTED, mapOf(
                                    "deviceName" to deviceName,
                                    "deviceAddress" to deviceAddress
                                ))
                            } catch (e: SecurityException) {
                                Log.e(TAG, "Missing BLUETOOTH_CONNECT permission", e)
                                sendEvent(EVENT_DISCONNECTED, mapOf(
                                    "deviceName" to "Permission Denied",
                                    "deviceAddress" to "unknown"
                                ))
                            }
                        }
                    }
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
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
            addAction(UiModeManager.ACTION_ENTER_CAR_MODE)
            addAction(UiModeManager.ACTION_EXIT_CAR_MODE)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(bluetoothReceiver, filter)
        }

        isListening = true
        Log.d(TAG, "Started listening for Bluetooth events")
    }

    private fun stopBluetoothListening() {
        if (!isListening) return

        val context = appContext.reactContext ?: return
        bluetoothReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Receiver already unregistered", e)
            }
        }
        bluetoothReceiver = null
        isListening = false
        Log.d(TAG, "Stopped listening for Bluetooth events")
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
}
