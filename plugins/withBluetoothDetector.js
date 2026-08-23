const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

function withBluetoothDetector(config) {
  // Add Android permissions, service, boot receiver, and queries
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
    ];

    permissions.forEach((permission) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add queries for Spotify app
    if (!manifest.queries) {
      manifest.queries = [];
    }
    // Check if Spotify query already exists
    const hasSpotifyQuery = manifest.queries.some(
      (q) => q.package?.some((p) => p.$?.['android:name'] === 'com.spotify.music')
    );
    if (!hasSpotifyQuery) {
      manifest.queries.push({
        package: [{ $: { 'android:name': 'com.spotify.music' } }],
      });
    }

    // Add Foreground Service and Boot Receiver to the application
    const application = manifest.application?.[0];
    if (application) {
      // Ensure service array exists
      if (!application.service) {
        application.service = [];
      }

      // Add BluetoothForegroundService
      const serviceExists = application.service.some(
        (s) => s.$?.['android:name'] === 'expo.modules.bluetoothdetector.BluetoothForegroundService'
      );
      if (!serviceExists) {
        application.service.push({
          $: {
            'android:name': 'expo.modules.bluetoothdetector.BluetoothForegroundService',
            'android:enabled': 'true',
            'android:exported': 'false',
            'android:foregroundServiceType': 'connectedDevice',
          },
        });
      }

      // Ensure receiver array exists
      if (!application.receiver) {
        application.receiver = [];
      }

      // Add BootReceiver
      const receiverExists = application.receiver.some(
        (r) => r.$?.['android:name'] === 'expo.modules.bluetoothdetector.BootReceiver'
      );
      if (!receiverExists) {
        application.receiver.push({
          $: {
            'android:name': 'expo.modules.bluetoothdetector.BootReceiver',
            'android:enabled': 'true',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
                { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
              ],
            },
          ],
        });
      }
    }

    return config;
  });

  return config;
}

module.exports = withBluetoothDetector;
