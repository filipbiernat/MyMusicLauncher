package expo.modules.bluetoothdetector

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log

/**
 * Starts the BluetoothForegroundService when the device boots.
 * Requires RECEIVE_BOOT_COMPLETED permission.
 * 
 * Only starts the service if it was previously enabled by the user
 * (checks SharedPreferences for serviceEnabled flag).
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "BT_BootReceiver"
        private const val PREFS_NAME = "MyMusicLauncherPrefs"
        private const val KEY_SERVICE_ENABLED = "serviceEnabled"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "═══ BootReceiver.onReceive: action=${intent.action} ═══")
        
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            // Check if service was enabled before reboot
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val wasEnabled = prefs.getBoolean(KEY_SERVICE_ENABLED, false)
            
            Log.i(TAG, "Boot completed. Service was enabled: $wasEnabled")
            
            if (wasEnabled) {
                try {
                    BluetoothForegroundService.start(context)
                    Log.i(TAG, "✓ Foreground Service started after boot")
                } catch (e: Exception) {
                    Log.e(TAG, "✗ Failed to start service on boot", e)
                }
            } else {
                Log.i(TAG, "Service was not enabled — skipping auto-start")
            }
        }
    }
}
